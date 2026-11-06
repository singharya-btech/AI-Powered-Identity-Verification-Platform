"""KYC Document Verification API Endpoints.

Handles authenticated document upload, local OpenCV/EasyOCR processing, structured
identity extraction, database session tracking, and audit logging with zero PII retention.
"""

import io
import logging
import math
import time
import uuid
from typing import List, Literal, Union
from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import asc, cast, desc, func, or_, select, String
from sqlalchemy.orm import Session

from backend.app.api.deps import get_current_user, require_admin, require_customer
from backend.app.db.session import get_db
from backend.app.models.audit_log import AuditLog
from backend.app.models.kyc_session import KycSession
from backend.app.models.user import User
from datetime import datetime, timezone
from backend.app.schemas.kyc import (
    AdminAnalyticsResponse,
    AdminReviewRequest,
    AuditLogResponse,
    DocumentOcrResponse,
    FaceVerificationResponse,
    KycCancelRequest,
    KycSessionResponse,
    PaginatedKycSessionsResponse,
)
from backend.app.services.ocr_service import DocumentOcrService
from backend.app.services.face_service import FaceVerificationService
from backend.app.services.workflow_service import KycWorkflowService, KycWorkflowStatus
from backend.app.services.report_service import KycReportService
from backend.app.core.metrics import (
    KYC_DOCUMENT_UPLOADS_TOTAL,
    KYC_OCR_DURATION_SECONDS,
    KYC_FACE_VERIFICATIONS_TOTAL,
    KYC_FACE_VERIFICATION_DURATION_SECONDS,
    KYC_WORKFLOW_STATUS_COUNT,
)

logger = logging.getLogger("uvicorn.error")

router = APIRouter(prefix="/kyc", tags=["KYC Document Verification"])


@router.post(
    "/document/upload",
    response_model=DocumentOcrResponse,
    status_code=status.HTTP_200_OK,
    summary="Upload and process identity document with local OCR",
    description="Accepts PAN or Aadhaar document image, runs local OpenCV and EasyOCR, and returns masked structured extraction.",
)
async def upload_and_process_document(
    document_type: Literal["PAN", "AADHAAR"] = Form(..., description="Document type (PAN or AADHAAR)"),
    file: UploadFile = File(..., description="Document image file (.jpg, .jpeg, .png, max 5MB)"),
    current_user: User = Depends(require_customer),
    db: Session = Depends(get_db),
) -> DocumentOcrResponse:
    """Upload document, run local OpenCV and EasyOCR, record session, and log audit trail."""
    # 1. Read file bytes
    try:
        contents = await file.read()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to read uploaded file contents.",
        ) from exc

    # 2. Validate file integrity and decode image
    img = DocumentOcrService.validate_file(file, contents)

    # 3. Execute local OCR & Postprocessing (timed for Prometheus telemetry)
    ocr_start_time = time.perf_counter()
    extracted_data, confidence_score, validation_messages = DocumentOcrService.process_document(
        img, document_type
    )
    ocr_duration = time.perf_counter() - ocr_start_time
    KYC_OCR_DURATION_SECONDS.labels(document_type=document_type).observe(ocr_duration)

    # 4. Determine status based on extraction results
    is_valid = extracted_data.get("is_format_valid", False)
    if is_valid and confidence_score >= 0.2:
        session_status = "PENDING_REVIEW"
        workflow_status = KycWorkflowStatus.AWAITING_FACE_VERIFICATION.value
    elif extracted_data.get("raw_number_found", False):
        session_status = "PENDING_REVIEW"
        workflow_status = KycWorkflowStatus.OCR_COMPLETED.value
    else:
        session_status = "REJECTED"
        workflow_status = KycWorkflowStatus.OCR_FAILED.value

    # Track metrics (Zero PII, categorical labels only)
    KYC_DOCUMENT_UPLOADS_TOTAL.labels(document_type=document_type, status=session_status).inc()
    KYC_WORKFLOW_STATUS_COUNT.labels(status=workflow_status).inc()

    failure_reason = "; ".join(validation_messages) if session_status == "REJECTED" and validation_messages else None

    # 5. Persist minimal metadata in PostgreSQL (Zero raw PII)
    kyc_session = KycSession(
        user_id=current_user.id,
        document_type=document_type,
        status=session_status,
        workflow_status=workflow_status,
        document_number_masked=extracted_data.get("document_number_masked"),
        extracted_name=extracted_data.get("name"),
        extracted_dob=extracted_data.get("dob"),
        extracted_gender=extracted_data.get("gender"),
        ocr_confidence=confidence_score,
        failure_reason=failure_reason,
    )
    db.add(kyc_session)
    db.flush()  # Obtain session ID

    # 5b. Attempt to detect and cache document portrait for facial verification
    has_face = FaceVerificationService.cache_document_face(kyc_session.id, img)
    if has_face:
        validation_messages.append("Document portrait photograph successfully detected and prepared for facial verification.")
    else:
        validation_messages.append("No portrait photograph identified on document; manual review or re-upload may be required for face verification.")

    # 6. Audit Logging (Zero raw PII stored in log action or message)
    audit_entry = AuditLog(
        user_id=current_user.id,
        action="DOCUMENT_OCR_PROCESSED",
        resource_type="kyc_session",
        resource_id=str(kyc_session.id),
    )
    db.add(audit_entry)
    db.commit()
    db.refresh(kyc_session)

    logger.info(
        "KYC OCR processed for user_id=%s, session_id=%s, doc_type=%s, status=%s, confidence=%.2f",
        current_user.id,
        kyc_session.id,
        document_type,
        session_status,
        confidence_score,
    )

    # 7. Construct and return sanitized response
    return DocumentOcrResponse(
        session_id=kyc_session.id,
        document_type=kyc_session.document_type,
        status=kyc_session.status,
        document_number_masked=kyc_session.document_number_masked,
        extracted_name=kyc_session.extracted_name,
        extracted_dob=kyc_session.extracted_dob,
        extracted_gender=kyc_session.extracted_gender,
        extracted_fields={
            "document_type": document_type,
            "document_number_masked": kyc_session.document_number_masked,
            "name": kyc_session.extracted_name,
            "dob": kyc_session.extracted_dob,
            "gender": kyc_session.extracted_gender,
            "fathers_name": extracted_data.get("fathers_name"),
        },
        is_format_valid=is_valid,
        confidence_score=confidence_score,
        validation_messages=validation_messages,
        created_at=kyc_session.created_at,
    )


@router.post(
    "/sessions/{session_id}/verify-face",
    response_model=FaceVerificationResponse,
    status_code=status.HTTP_200_OK,
    summary="Verify applicant selfie against document portrait",
    description="Compares live selfie captured from webcam against face photo extracted from document using FaceNet.",
)
async def verify_face_biometrics(
    session_id: uuid.UUID,
    selfie: UploadFile = File(..., description="Selfie image file (.jpg, .png, max 5MB)"),
    consent: bool = Form(..., description="Customer explicit consent for biometric processing"),
    document_face: UploadFile | None = File(None, description="Optional document portrait fallback"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> FaceVerificationResponse:
    """Verify facial similarity between ID document portrait and live selfie."""
    # 1. Fetch KYC session
    session = db.execute(
        select(KycSession).where(KycSession.id == session_id)
    ).scalar_one_or_none()

    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="KYC session not found.",
        )

    # 2. RBAC check: Only session owner or Admin can perform/trigger verification
    is_admin = current_user.role and current_user.role.name == "ADMIN"
    if session.user_id != current_user.id and not is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: this KYC session belongs to another user.",
        )

    # 2b. State machine check
    current_wf = session.workflow_status or session.status
    if current_wf in (KycWorkflowStatus.APPROVED.value, KycWorkflowStatus.CANCELLED.value):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot perform face verification on a session in '{current_wf}' status.",
        )

    # 3. Explicit consent check
    if not consent:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Biometric consent is mandatory before processing facial image.",
        )

    # 4. Retrieve document face crop
    doc_face = FaceVerificationService.load_cached_document_face(session_id)
    if doc_face is None and document_face is not None:
        try:
            doc_contents = await document_face.read()
            doc_img = FaceVerificationService.validate_and_decode_selfie(doc_contents)
            from backend.face_verification import detect_and_extract_face
            doc_face = detect_and_extract_face(doc_img)
        except Exception as exc:
            logger.warning("Failed to extract face from provided document_face: %s", exc)

    if doc_face is None or doc_face.size == 0:
        session.face_match_status = "FAILED"
        session.failure_reason = "No document face photo available for biometric comparison."
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No document face photo found for this session. Please re-upload your document first.",
        )

    # 5. Read and validate live selfie
    try:
        selfie_contents = await selfie.read()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to read uploaded selfie image.",
        ) from exc

    selfie_img = FaceVerificationService.validate_and_decode_selfie(selfie_contents)
    selfie_face, selfie_messages = FaceVerificationService.extract_selfie_face(selfie_img)

    # 6. Biometric Facial Verification (timed for Prometheus telemetry)
    face_start_time = time.perf_counter()
    cmp_result = FaceVerificationService.compare_faces(doc_face, selfie_face)
    face_duration = time.perf_counter() - face_start_time
    is_match = cmp_result["is_match"]
    similarity_score = cmp_result["similarity_score"]
    distance = cmp_result["distance"]
    threshold = cmp_result["threshold"]

    # Record biometric verification telemetry (Zero embeddings or PII retained)
    KYC_FACE_VERIFICATION_DURATION_SECONDS.observe(face_duration)
    KYC_FACE_VERIFICATIONS_TOTAL.labels(result="match" if is_match else "mismatch").inc()

    # 7. Update Session State & User Status
    session.biometric_consent = True
    session.face_match_score = similarity_score
    session.face_match_status = "MATCH" if is_match else "NO_MATCH"
    session.face_verified = is_match

    validation_messages = list(selfie_messages)
    if is_match:
        validation_messages.append(
            f"Facial similarity verified successfully ({similarity_score}% match, cosine distance: {distance} <= {threshold})."
        )
        session.workflow_status = KycWorkflowStatus.FACE_MATCHED.value
        session.status = KycWorkflowStatus.FACE_MATCHED.value
        # NOTE: In Task 06, we do NOT auto-verify applicant (current_user.is_verified remains False until Admin approval).
    else:
        session.workflow_status = KycWorkflowStatus.FACE_MISMATCHED.value
        session.status = "REJECTED"
        session.failure_reason = (
            f"Face verification did not match identity document: similarity {similarity_score}% "
            f"(distance: {distance} > threshold: {threshold})."
        )
        validation_messages.append(
            f"Face mismatch: similarity score ({similarity_score}%) is below required verification threshold."
        )

    KYC_WORKFLOW_STATUS_COUNT.labels(status=session.workflow_status).inc()

    # Liveness limitation transparency
    validation_messages.append(
        "Liveness anti-spoofing not assessed: standard camera capture does not detect physical prints or screen replay."
    )

    # 8. Immediate Privacy Cleanup: remove temporary face crop
    FaceVerificationService.cleanup_cached_document_face(session_id)

    # 9. Audit Logging (Zero biometric images or embeddings stored in database)
    audit_entry = AuditLog(
        user_id=current_user.id,
        action="BIOMETRIC_FACE_VERIFICATION",
        resource_type="kyc_session",
        resource_id=str(session.id),
    )
    db.add(audit_entry)
    db.commit()
    db.refresh(session)

    logger.info(
        "Face verification completed for session %s (user %s): is_match=%s, similarity=%.2f%%",
        session.id,
        current_user.id,
        is_match,
        similarity_score,
    )

    return FaceVerificationResponse(
        session_id=session.id,
        status=session.status,
        face_detected_document=True,
        face_detected_selfie=True,
        similarity_score=similarity_score,
        distance=distance,
        threshold=threshold,
        is_match=is_match,
        liveness_status="UNASSESSED",
        validation_messages=validation_messages,
        timestamp=datetime.now(timezone.utc),
    )


def build_session_response(session: KycSession, db: Session) -> KycSessionResponse:
    """Helper to convert KycSession model to KycSessionResponse schema including audit log trail."""
    logs = db.execute(
        select(AuditLog)
        .where(
            AuditLog.resource_type == "kyc_session",
            AuditLog.resource_id == str(session.id),
        )
        .order_by(AuditLog.timestamp.asc())
    ).scalars().all()

    resp = KycSessionResponse.model_validate(session)
    resp.customer_name = session.user.full_name if session.user else (session.extracted_name or None)
    resp.customer_email = session.user.email if session.user else None
    resp.admin_reviewer_name = session.admin_reviewer.full_name if session.admin_reviewer else None
    resp.audit_logs = [AuditLogResponse.model_validate(log) for log in logs]
    return resp


def build_session_responses(sessions: list[KycSession], db: Session) -> list[KycSessionResponse]:
    """Helper to batch construct KycSessionResponse objects with their audit logs without N+1 queries."""
    if not sessions:
        return []
    session_ids = [str(s.id) for s in sessions]
    all_logs = db.execute(
        select(AuditLog)
        .where(
            AuditLog.resource_type == "kyc_session",
            AuditLog.resource_id.in_(session_ids),
        )
        .order_by(AuditLog.timestamp.asc())
    ).scalars().all()

    logs_by_session: dict[str, list[AuditLog]] = {}
    for log in all_logs:
        logs_by_session.setdefault(log.resource_id, []).append(log)

    results: list[KycSessionResponse] = []
    for s in sessions:
        resp = KycSessionResponse.model_validate(s)
        resp.customer_name = s.user.full_name if s.user else (s.extracted_name or None)
        resp.customer_email = s.user.email if s.user else None
        resp.admin_reviewer_name = s.admin_reviewer.full_name if s.admin_reviewer else None
        resp.audit_logs = [
            AuditLogResponse.model_validate(l)
            for l in logs_by_session.get(str(s.id), [])
        ]
        results.append(resp)
    return results


@router.post(
    "/sessions/{session_id}/submit",
    response_model=KycSessionResponse,
    summary="Submit KYC session for Administrator Review",
    description="Transitions an in-progress KYC session to PENDING_ADMIN_REVIEW status.",
)
def submit_kyc_session(
    session_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> KycSessionResponse:
    """Submit a completed verification session for compliance administrator review."""
    session = db.execute(
        select(KycSession).where(KycSession.id == session_id)
    ).scalar_one_or_none()

    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="KYC session not found.",
        )

    updated_session = KycWorkflowService.submit_for_admin_review(
        session=session,
        customer=current_user,
        db=db,
    )
    KYC_WORKFLOW_STATUS_COUNT.labels(status=updated_session.workflow_status).inc()
    return build_session_response(updated_session, db)


@router.post(
    "/sessions/{session_id}/cancel",
    response_model=KycSessionResponse,
    summary="Cancel an active KYC session",
    description="Transitions an active KYC session to CANCELLED status.",
)
def cancel_kyc_session(
    session_id: uuid.UUID,
    body: KycCancelRequest = Body(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> KycSessionResponse:
    """Cancel an active or pending verification session."""
    session = db.execute(
        select(KycSession).where(KycSession.id == session_id)
    ).scalar_one_or_none()

    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="KYC session not found.",
        )

    updated_session = KycWorkflowService.cancel_session(
        session=session,
        actor=current_user,
        db=db,
        reason=body.reason,
    )
    return build_session_response(updated_session, db)


@router.get(
    "/admin/analytics",
    response_model=AdminAnalyticsResponse,
    summary="Admin compliance telemetry & analytics",
    description="Calculates real-time compliance metrics directly from PostgreSQL.",
)
def get_admin_compliance_analytics(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> AdminAnalyticsResponse:
    """Return real-time compliance analytics computed directly from database tables."""
    return KycReportService.get_admin_analytics(db)


@router.post(
    "/admin/sessions/{session_id}/review",
    response_model=KycSessionResponse,
    summary="Admin review decision (Approve or Reject with mandatory reason)",
    description="Administrator grants verified status or rejects session with mandatory reason.",
)
def admin_review_kyc_session(
    session_id: uuid.UUID,
    body: AdminReviewRequest = Body(...),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> KycSessionResponse:
    """Admin review decision: APPROVED or REJECTED. Row-level locked to prevent concurrency races."""
    session = db.execute(
        select(KycSession).where(KycSession.id == session_id).with_for_update()
    ).scalar_one_or_none()

    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="KYC session not found.",
        )

    updated_session = KycWorkflowService.admin_review_decision(
        session=session,
        decision=body.decision,
        reason=body.reason,
        admin=admin,
        db=db,
    )
    KYC_WORKFLOW_STATUS_COUNT.labels(status=updated_session.workflow_status).inc()
    return build_session_response(updated_session, db)


@router.get(
    "/sessions/me",
    response_model=List[KycSessionResponse],
    summary="List customer's own verification sessions",
)
def get_my_kyc_sessions(
    current_user: User = Depends(require_customer),
    db: Session = Depends(get_db),
) -> List[KycSessionResponse]:
    """Retrieve all KYC sessions belonging to the authenticated customer."""
    sessions = db.execute(
        select(KycSession)
        .where(KycSession.user_id == current_user.id)
        .order_by(KycSession.created_at.desc())
    ).scalars().all()
    return build_session_responses(list(sessions), db)


@router.get(
    "/sessions/{session_id}",
    response_model=KycSessionResponse,
    summary="Get verification session details by ID",
)
def get_kyc_session_by_id(
    session_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> KycSessionResponse:
    """Retrieve details for a specific session. Customer may access own; Admin can access any."""
    session = db.execute(
        select(KycSession).where(KycSession.id == session_id)
    ).scalar_one_or_none()

    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="KYC session not found.",
        )

    # RBAC: Only owner or ADMIN can view
    is_admin = current_user.role and current_user.role.name == "ADMIN"
    if session.user_id != current_user.id and not is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to view this KYC session.",
        )

    return build_session_response(session, db)


@router.get(
    "/admin/sessions",
    response_model=Union[PaginatedKycSessionsResponse, List[KycSessionResponse]],
    summary="List all KYC sessions with optional pagination, search, and filtering",
)
def list_all_kyc_sessions_admin(
    page: int | None = Query(None, ge=1, description="Page number for server-side pagination"),
    page_size: int = Query(10, ge=1, le=100, description="Items per page"),
    status_filter: str | None = Query(None, description="Filter by workflow_status or status"),
    date_from: datetime | None = Query(None, description="Filter submission date from (inclusive)"),
    date_to: datetime | None = Query(None, description="Filter submission date to (inclusive)"),
    search: str | None = Query(None, description="Search by customer name, email, masked document, or session UUID"),
    sort_by: Literal["created_at", "updated_at", "status", "workflow_status"] = Query("created_at"),
    sort_order: Literal["asc", "desc"] = Query("desc"),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Admin-only endpoint listing all verification sessions with optional filtering, search, and pagination."""
    query = select(KycSession).outerjoin(User, KycSession.user_id == User.id)

    if status_filter and status_filter.strip() and status_filter.strip() != "ALL":
        s_val = status_filter.strip()
        query = query.where(
            or_(
                KycSession.workflow_status == s_val,
                KycSession.status == s_val,
                KycSession.admin_review_status == s_val,
            )
        )

    if date_from:
        query = query.where(KycSession.created_at >= date_from)

    if date_to:
        query = query.where(KycSession.created_at <= date_to)

    if search and search.strip():
        search_term = f"%{search.strip()}%"
        query = query.where(
            or_(
                KycSession.extracted_name.ilike(search_term),
                KycSession.document_number_masked.ilike(search_term),
                cast(KycSession.id, String).ilike(search_term),
                User.full_name.ilike(search_term),
                User.email.ilike(search_term),
            )
        )

    # Sorting
    sort_column_map = {
        "created_at": KycSession.created_at,
        "updated_at": KycSession.updated_at,
        "status": KycSession.status,
        "workflow_status": KycSession.workflow_status,
    }
    col = sort_column_map.get(sort_by, KycSession.created_at)
    order_clause = desc(col) if sort_order == "desc" else asc(col)
    query = query.order_by(order_clause)

    # Server-side pagination if page parameter is explicitly provided
    if page is not None:
        count_stmt = select(func.count()).select_from(query.subquery())
        total = db.execute(count_stmt).scalar() or 0
        total_pages = math.ceil(total / page_size) if total > 0 else 1

        offset = (page - 1) * page_size
        paginated_query = query.offset(offset).limit(page_size)
        sessions = db.execute(paginated_query).scalars().all()

        return PaginatedKycSessionsResponse(
            items=build_session_responses(list(sessions), db),
            total=total,
            page=page,
            page_size=page_size,
            total_pages=total_pages,
        )

    # Unpaginated list for full lists / backward compatibility
    sessions = db.execute(query).scalars().all()
    return build_session_responses(list(sessions), db)


@router.get(
    "/admin/reports/export/csv",
    summary="Export KYC application records to CSV",
    description="Generates streamable CSV export with formula injection defense (CWE-1236).",
)
def export_kyc_reports_csv(
    status_filter: str | None = Query(None, description="Filter by workflow_status or status"),
    date_from: datetime | None = Query(None, description="Submission date >= date_from"),
    date_to: datetime | None = Query(None, description="Submission date <= date_to"),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Admin-only streamable CSV export with formula injection defense."""
    query = select(KycSession).outerjoin(User, KycSession.user_id == User.id)

    if status_filter and status_filter.strip() and status_filter.strip() != "ALL":
        s_val = status_filter.strip()
        query = query.where(
            or_(
                KycSession.workflow_status == s_val,
                KycSession.status == s_val,
                KycSession.admin_review_status == s_val,
            )
        )

    if date_from:
        query = query.where(KycSession.created_at >= date_from)

    if date_to:
        query = query.where(KycSession.created_at <= date_to)

    query = query.order_by(KycSession.created_at.desc())
    sessions = db.execute(query).scalars().all()

    csv_data = KycReportService.export_csv(list(sessions))
    timestamp_str = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    filename = f"kyc_report_{timestamp_str}.csv"

    return StreamingResponse(
        io.StringIO(csv_data),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get(
    "/admin/reports/export/excel",
    summary="Export KYC application records to Excel (.xlsx)",
    description="Generates streamable formatted Excel export with formula injection defense.",
)
def export_kyc_reports_excel(
    status_filter: str | None = Query(None, description="Filter by workflow_status or status"),
    date_from: datetime | None = Query(None, description="Submission date >= date_from"),
    date_to: datetime | None = Query(None, description="Submission date <= date_to"),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Admin-only streamable Excel (.xlsx) export with formula injection defense."""
    query = select(KycSession).outerjoin(User, KycSession.user_id == User.id)

    if status_filter and status_filter.strip() and status_filter.strip() != "ALL":
        s_val = status_filter.strip()
        query = query.where(
            or_(
                KycSession.workflow_status == s_val,
                KycSession.status == s_val,
                KycSession.admin_review_status == s_val,
            )
        )

    if date_from:
        query = query.where(KycSession.created_at >= date_from)

    if date_to:
        query = query.where(KycSession.created_at <= date_to)

    query = query.order_by(KycSession.created_at.desc())
    sessions = db.execute(query).scalars().all()

    excel_bytes = KycReportService.export_excel(list(sessions))
    timestamp_str = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    filename = f"kyc_report_{timestamp_str}.xlsx"

    return StreamingResponse(
        io.BytesIO(excel_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


