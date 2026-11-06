"""End-to-End KYC Workflow and State Machine Integration Tests.

Validates:
1. End-to-end lifecycle from document upload through face verification,
   applicant submission, and administrator review/decision.
2. State machine transitions and invalid transition rejections.
3. Strict enforcement: applicants are NEVER automatically verified until Admin approval.
4. Mandatory explanation reason on administrative rejection.
5. RBAC security enforcement on session submission, cancellation, and admin review.
6. Cancellation mechanics and terminal state protection.
7. Admin session search and status filtering.
8. Audit trail completeness across all state changes.
"""

import io
import uuid
from unittest.mock import patch
import cv2
import numpy as np
import pytest
from PIL import Image
from sqlalchemy import select

from backend.app.core.security import create_access_token
from backend.app.models.audit_log import AuditLog
from backend.app.models.kyc_session import KycSession
from backend.app.models.role import Role
from backend.app.models.user import User
from backend.app.services.face_service import FaceVerificationService
from backend.app.services.workflow_service import KycWorkflowService, KycWorkflowStatus


def create_test_image_bytes(width: int = 200, height: int = 200, color: tuple = (180, 180, 180)) -> bytes:
    """Generate a clean synthetic JPEG image."""
    img = Image.new("RGB", (width, height), color=color)
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


@pytest.fixture
def auth_customer(db_session):
    """Create a test customer and valid JWT token."""
    customer = User(
        full_name="Workflow Customer",
        email=f"workflow_{uuid.uuid4().hex[:6]}@example.com",
        password_hash="$2b$12$eXampleHashedPasswordValue1234567890123456789012",
        role_id=2,  # CUSTOMER
        is_active=True,
        is_verified=False,
    )
    db_session.add(customer)
    db_session.commit()
    db_session.refresh(customer)

    customer_role = db_session.get(Role, 2)
    token = create_access_token(
        subject=customer.id,
        extra_claims={"email": customer.email, "role": customer_role.name},
    )
    return customer, token


@pytest.fixture
def auth_customer_two(db_session):
    """Create a second customer for RBAC ownership tests."""
    other = User(
        full_name="Other Applicant",
        email=f"other_{uuid.uuid4().hex[:6]}@example.com",
        password_hash="$2b$12$eXampleHashedPasswordValue1234567890123456789012",
        role_id=2,
        is_active=True,
        is_verified=False,
    )
    db_session.add(other)
    db_session.commit()
    db_session.refresh(other)

    other_role = db_session.get(Role, 2)
    token = create_access_token(
        subject=other.id,
        extra_claims={"email": other.email, "role": other_role.name},
    )
    return other, token


@pytest.fixture
def auth_admin(db_session):
    """Create a test compliance admin and valid JWT token."""
    admin = User(
        full_name="Compliance Admin",
        email=f"admin_wf_{uuid.uuid4().hex[:6]}@example.com",
        password_hash="$2b$12$eXampleHashedPasswordValue1234567890123456789012",
        role_id=1,  # ADMIN
        is_active=True,
        is_verified=True,
    )
    db_session.add(admin)
    db_session.commit()
    db_session.refresh(admin)

    admin_role = db_session.get(Role, 1)
    token = create_access_token(
        subject=admin.id,
        extra_claims={"email": admin.email, "role": admin_role.name},
    )
    return admin, token


# =========================================================================
# 1. Complete End-to-End Workflow & Identity Verification Authority
# =========================================================================

def test_full_kyc_workflow_end_to_end_approval(client, db_session, auth_customer, auth_admin, monkeypatch):
    """Verify entire workflow from document upload -> face verification -> submission -> admin approval.
    
    CRITICAL: Customer is NOT verified until Admin officially approves.
    """
    customer, customer_token = auth_customer
    admin, admin_token = auth_admin

    # Mock OCR extraction
    def mock_extract(img, *args, **kwargs):
        return (
            "INCOME TAX DEPARTMENT|PERMANENT ACCOUNT NUMBER CARD|ABCDE1234F|JOHN DOE|01/01/1990",
            0.94,
            ["ABCDE1234F", "JOHN DOE"],
        )

    monkeypatch.setattr("backend.app.services.ocr_service.extract_text_with_details", mock_extract)

    # Step 1: Upload Document
    doc_bytes = create_test_image_bytes(400, 250)
    upload_res = client.post(
        "/api/v1/kyc/document/upload",
        headers={"Authorization": f"Bearer {customer_token}"},
        data={"document_type": "PAN"},
        files={"file": ("pan.jpg", doc_bytes, "image/jpeg")},
    )
    assert upload_res.status_code == 200
    session_id = upload_res.json()["session_id"]

    # Verify session is created and awaiting face verification
    session = db_session.get(KycSession, uuid.UUID(session_id))
    assert session is not None
    assert session.workflow_status == KycWorkflowStatus.AWAITING_FACE_VERIFICATION.value

    # Verify applicant is NOT verified yet
    db_session.refresh(customer)
    assert customer.is_verified is False

    # Step 2: Face Verification
    dummy_doc_face = np.ones((160, 160, 3), dtype=np.uint8) * 128
    temp_path = FaceVerificationService.get_temp_face_path(session.id)
    cv2.imwrite(str(temp_path), dummy_doc_face)

    selfie_bytes = create_test_image_bytes(200, 200)
    dummy_selfie = np.ones((160, 160, 3), dtype=np.uint8) * 128

    with patch.object(
        FaceVerificationService,
        "extract_selfie_face",
        return_value=(dummy_selfie, ["Face detected."]),
    ), patch.object(
        FaceVerificationService,
        "compare_faces",
        return_value={
            "distance": 0.12,
            "threshold": 0.40,
            "is_match": True,
            "similarity_score": 88.0,
            "model": "Facenet",
        },
    ):
        face_res = client.post(
            f"/api/v1/kyc/sessions/{session.id}/verify-face",
            headers={"Authorization": f"Bearer {customer_token}"},
            data={"consent": "true"},
            files={"selfie": ("selfie.jpg", selfie_bytes, "image/jpeg")},
        )
    assert face_res.status_code == 200
    assert face_res.json()["is_match"] is True

    # Face verification passed, status is FACE_MATCHED, but user MUST NOT be verified yet
    db_session.refresh(session)
    assert session.workflow_status == KycWorkflowStatus.FACE_MATCHED.value
    db_session.refresh(customer)
    assert customer.is_verified is False  # Authority: Admin must approve

    # Step 3: Customer Submits for Admin Review
    submit_res = client.post(
        f"/api/v1/kyc/sessions/{session.id}/submit",
        headers={"Authorization": f"Bearer {customer_token}"},
    )
    assert submit_res.status_code == 200
    data = submit_res.json()
    assert data["workflow_status"] == KycWorkflowStatus.PENDING_ADMIN_REVIEW.value
    assert data["admin_review_status"] == "PENDING"

    # Step 4: Admin Reviews and Approves
    review_res = client.post(
        f"/api/v1/kyc/admin/sessions/{session.id}/review",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"decision": "APPROVED", "reason": None},
    )
    assert review_res.status_code == 200
    review_data = review_res.json()
    assert review_data["workflow_status"] == "APPROVED"
    assert review_data["admin_review_status"] == "APPROVED"

    # Verify user is NOW officially verified
    db_session.refresh(customer)
    assert customer.is_verified is True

    # Step 5: Verify Full Audit Log Trail
    get_res = client.get(
        f"/api/v1/kyc/sessions/{session.id}",
        headers={"Authorization": f"Bearer {customer_token}"},
    )
    assert get_res.status_code == 200
    logs = get_res.json()["audit_logs"]
    actions = [log["action"] for log in logs]
    assert "DOCUMENT_OCR_PROCESSED" in actions
    assert "BIOMETRIC_FACE_VERIFICATION" in actions
    assert "KYC_SUBMITTED_FOR_REVIEW" in actions
    assert "ADMIN_APPROVED_KYC" in actions


# =========================================================================
# 2. Administrative Rejection with Mandatory Reason Enforcement
# =========================================================================

def test_admin_rejection_without_reason_rejected(client, db_session, auth_customer, auth_admin):
    """Admin rejection strictly mandates an explanation reason (HTTP 400 if missing or empty)."""
    customer, _ = auth_customer
    admin, admin_token = auth_admin

    session = KycSession(
        user_id=customer.id,
        document_type="PAN",
        status="PENDING_REVIEW",
        workflow_status="PENDING_ADMIN_REVIEW",
        admin_review_status="PENDING",
    )
    db_session.add(session)
    db_session.commit()

    # Empty string reason
    res = client.post(
        f"/api/v1/kyc/admin/sessions/{session.id}/review",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"decision": "REJECTED", "reason": "   "},
    )
    assert res.status_code == 400
    assert "explanation reason is mandatory" in res.json()["detail"].lower()

    # None / null reason
    res_none = client.post(
        f"/api/v1/kyc/admin/sessions/{session.id}/review",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"decision": "REJECTED", "reason": None},
    )
    assert res_none.status_code == 400


def test_admin_rejection_with_valid_reason_success(client, db_session, auth_customer, auth_admin):
    """Admin rejection with a valid reason transitions session to REJECTED and leaves user unverified."""
    customer, _ = auth_customer
    admin, admin_token = auth_admin

    session = KycSession(
        user_id=customer.id,
        document_type="AADHAAR",
        status="PENDING_REVIEW",
        workflow_status="PENDING_ADMIN_REVIEW",
        admin_review_status="PENDING",
    )
    db_session.add(session)
    db_session.commit()

    rejection_msg = "Aadhaar document edges are cropped and text is partially obscured."
    res = client.post(
        f"/api/v1/kyc/admin/sessions/{session.id}/review",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"decision": "REJECTED", "reason": rejection_msg},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["workflow_status"] == "REJECTED"
    assert data["admin_review_status"] == "REJECTED"
    assert data["rejection_reason"] == rejection_msg

    # User remains unverified
    db_session.refresh(customer)
    assert customer.is_verified is False


# =========================================================================
# 3. State Machine & Transition Rules
# =========================================================================

def test_cannot_modify_approved_session(client, db_session, auth_customer, auth_admin):
    """Approved sessions are terminal and cannot be re-reviewed, submitted, or cancelled."""
    customer, customer_token = auth_customer
    admin, admin_token = auth_admin

    session = KycSession(
        user_id=customer.id,
        document_type="PAN",
        status="APPROVED",
        workflow_status="APPROVED",
        admin_review_status="APPROVED",
    )
    db_session.add(session)
    db_session.commit()

    # Cannot re-review
    res_rev = client.post(
        f"/api/v1/kyc/admin/sessions/{session.id}/review",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"decision": "REJECTED", "reason": "Attempted override"},
    )
    assert res_rev.status_code == 400
    assert "already approved" in res_rev.json()["detail"].lower()

    # Cannot re-submit
    res_sub = client.post(
        f"/api/v1/kyc/sessions/{session.id}/submit",
        headers={"Authorization": f"Bearer {customer_token}"},
    )
    assert res_sub.status_code == 400

    # Cannot cancel
    res_can = client.post(
        f"/api/v1/kyc/sessions/{session.id}/cancel",
        headers={"Authorization": f"Bearer {customer_token}"},
        json={"reason": "User cancel"},
    )
    assert res_can.status_code == 400


def test_invalid_state_machine_transitions():
    """State machine validate_transition helper raises 400 on forbidden steps."""
    with pytest.raises(Exception) as excinfo:
        KycWorkflowService.validate_transition(
            current_status=KycWorkflowStatus.APPROVED.value,
            target_status=KycWorkflowStatus.PENDING_ADMIN_REVIEW.value,
        )
    assert "Invalid KYC workflow transition" in str(excinfo.value)


# =========================================================================
# 4. Session Cancellation
# =========================================================================

def test_customer_can_cancel_active_session(client, db_session, auth_customer):
    """Customer can cleanly cancel an in-progress session."""
    customer, token = auth_customer

    session = KycSession(
        user_id=customer.id,
        document_type="PAN",
        status="PENDING_REVIEW",
        workflow_status="AWAITING_FACE_VERIFICATION",
    )
    db_session.add(session)
    db_session.commit()

    res = client.post(
        f"/api/v1/kyc/sessions/{session.id}/cancel",
        headers={"Authorization": f"Bearer {token}"},
        json={"reason": "Decided to verify identity tomorrow instead"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["workflow_status"] == "CANCELLED"
    assert "Decided to verify identity tomorrow" in data["failure_reason"]

    # Subsequent cancellation on already cancelled session fails
    res_again = client.post(
        f"/api/v1/kyc/sessions/{session.id}/cancel",
        headers={"Authorization": f"Bearer {token}"},
        json={"reason": "Again"},
    )
    assert res_again.status_code == 400
    assert "already cancelled" in res_again.json()["detail"].lower()


# =========================================================================
# 5. RBAC & Ownership Security
# =========================================================================

def test_customer_cannot_submit_or_cancel_other_user_session(client, db_session, auth_customer, auth_customer_two):
    """Customers are forbidden from modifying sessions belonging to others."""
    customer1, _ = auth_customer
    _, token2 = auth_customer_two

    session = KycSession(
        user_id=customer1.id,
        document_type="PAN",
        status="PENDING_REVIEW",
        workflow_status="FACE_MATCHED",
    )
    db_session.add(session)
    db_session.commit()

    # User 2 tries to submit User 1's session
    sub_res = client.post(
        f"/api/v1/kyc/sessions/{session.id}/submit",
        headers={"Authorization": f"Bearer {token2}"},
    )
    assert sub_res.status_code == 403

    # User 2 tries to cancel User 1's session
    can_res = client.post(
        f"/api/v1/kyc/sessions/{session.id}/cancel",
        headers={"Authorization": f"Bearer {token2}"},
        json={"reason": "Malicious attempt"},
    )
    assert can_res.status_code == 403


def test_customer_cannot_access_admin_review_endpoint(client, db_session, auth_customer):
    """Customers attempting to call admin review endpoint are rejected with 403 Forbidden."""
    customer, token = auth_customer

    session = KycSession(
        user_id=customer.id,
        document_type="PAN",
        status="PENDING_REVIEW",
        workflow_status="PENDING_ADMIN_REVIEW",
    )
    db_session.add(session)
    db_session.commit()

    res = client.post(
        f"/api/v1/kyc/admin/sessions/{session.id}/review",
        headers={"Authorization": f"Bearer {token}"},
        json={"decision": "APPROVED"},
    )
    assert res.status_code == 403


# =========================================================================
# 6. Admin Search & Status Filtering
# =========================================================================

def test_admin_sessions_filter_and_search(client, db_session, auth_admin, auth_customer):
    """Admin can search sessions by customer name / masked doc and filter by status."""
    admin, admin_token = auth_admin
    customer, _ = auth_customer

    s1 = KycSession(
        user_id=customer.id,
        document_type="PAN",
        status="PENDING_REVIEW",
        workflow_status="PENDING_ADMIN_REVIEW",
        document_number_masked="ABCDE****1",
        extracted_name="Alice Smith",
    )
    s2 = KycSession(
        user_id=customer.id,
        document_type="AADHAAR",
        status="APPROVED",
        workflow_status="APPROVED",
        document_number_masked="XXXX-XXXX-9999",
        extracted_name="Bob Jones",
    )
    db_session.add_all([s1, s2])
    db_session.commit()

    # Filter by PENDING_ADMIN_REVIEW
    res_filter = client.get(
        "/api/v1/kyc/admin/sessions?status_filter=PENDING_ADMIN_REVIEW",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert res_filter.status_code == 200
    filtered_sessions = res_filter.json()
    assert any(s["id"] == str(s1.id) for s in filtered_sessions)
    assert not any(s["id"] == str(s2.id) for s in filtered_sessions)

    # Search by masked document number
    res_search = client.get(
        "/api/v1/kyc/admin/sessions?search=9999",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert res_search.status_code == 200
    search_sessions = res_search.json()
    assert any(s["id"] == str(s2.id) for s in search_sessions)
    assert not any(s["id"] == str(s1.id) for s in search_sessions)

