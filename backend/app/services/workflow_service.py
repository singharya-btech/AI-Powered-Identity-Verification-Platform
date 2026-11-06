"""Centralized KYC Workflow State Machine and Lifecycle Service.

Enforces valid status transitions, transaction-safe updates, RBAC enforcement,
administrative review decisions, and tamper-evident audit logging.
"""

from datetime import datetime, timezone
from enum import Enum
import logging
import uuid
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from backend.app.models.audit_log import AuditLog
from backend.app.models.kyc_session import KycSession
from backend.app.models.user import User

logger = logging.getLogger("uvicorn.error")


class KycWorkflowStatus(str, Enum):
    """Centralized lifecycle statuses for KYC Verification Sessions."""

    NOT_STARTED = "NOT_STARTED"
    DOCUMENT_UPLOADED = "DOCUMENT_UPLOADED"
    OCR_COMPLETED = "OCR_COMPLETED"
    OCR_FAILED = "OCR_FAILED"
    AWAITING_FACE_VERIFICATION = "AWAITING_FACE_VERIFICATION"
    FACE_MATCHED = "FACE_MATCHED"
    FACE_MISMATCHED = "FACE_MISMATCHED"
    PENDING_ADMIN_REVIEW = "PENDING_ADMIN_REVIEW"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    CANCELLED = "CANCELLED"


# Transition validation table
VALID_TRANSITIONS: dict[str, set[str]] = {
    # Initial / Unprocessed
    KycWorkflowStatus.NOT_STARTED.value: {
        KycWorkflowStatus.DOCUMENT_UPLOADED.value,
        KycWorkflowStatus.OCR_COMPLETED.value,
        KycWorkflowStatus.OCR_FAILED.value,
        KycWorkflowStatus.AWAITING_FACE_VERIFICATION.value,
        KycWorkflowStatus.FACE_MATCHED.value,
        KycWorkflowStatus.FACE_MISMATCHED.value,
        KycWorkflowStatus.PENDING_ADMIN_REVIEW.value,
        KycWorkflowStatus.CANCELLED.value,
    },
    "PENDING": {  # Backward compatibility with initial schema
        KycWorkflowStatus.DOCUMENT_UPLOADED.value,
        KycWorkflowStatus.OCR_COMPLETED.value,
        KycWorkflowStatus.OCR_FAILED.value,
        KycWorkflowStatus.AWAITING_FACE_VERIFICATION.value,
        KycWorkflowStatus.CANCELLED.value,
    },
    # Document Upload & OCR
    KycWorkflowStatus.DOCUMENT_UPLOADED.value: {
        KycWorkflowStatus.OCR_COMPLETED.value,
        KycWorkflowStatus.OCR_FAILED.value,
        KycWorkflowStatus.AWAITING_FACE_VERIFICATION.value,
        KycWorkflowStatus.CANCELLED.value,
    },
    KycWorkflowStatus.OCR_COMPLETED.value: {
        KycWorkflowStatus.AWAITING_FACE_VERIFICATION.value,
        KycWorkflowStatus.PENDING_ADMIN_REVIEW.value,
        KycWorkflowStatus.CANCELLED.value,
    },
    KycWorkflowStatus.OCR_FAILED.value: {
        KycWorkflowStatus.DOCUMENT_UPLOADED.value,
        KycWorkflowStatus.PENDING_ADMIN_REVIEW.value,
        KycWorkflowStatus.CANCELLED.value,
    },
    # Facial Verification
    KycWorkflowStatus.AWAITING_FACE_VERIFICATION.value: {
        KycWorkflowStatus.FACE_MATCHED.value,
        KycWorkflowStatus.FACE_MISMATCHED.value,
        KycWorkflowStatus.PENDING_ADMIN_REVIEW.value,
        KycWorkflowStatus.CANCELLED.value,
    },
    KycWorkflowStatus.FACE_MATCHED.value: {
        KycWorkflowStatus.PENDING_ADMIN_REVIEW.value,
        KycWorkflowStatus.APPROVED.value,
        KycWorkflowStatus.CANCELLED.value,
    },
    KycWorkflowStatus.FACE_MISMATCHED.value: {
        KycWorkflowStatus.AWAITING_FACE_VERIFICATION.value,  # Retry webcam capture
        KycWorkflowStatus.PENDING_ADMIN_REVIEW.value,  # Submit for manual dispute review
        KycWorkflowStatus.REJECTED.value,
        KycWorkflowStatus.CANCELLED.value,
    },
    # Administrative Review
    KycWorkflowStatus.PENDING_ADMIN_REVIEW.value: {
        KycWorkflowStatus.APPROVED.value,
        KycWorkflowStatus.REJECTED.value,
        KycWorkflowStatus.CANCELLED.value,
    },
    "PENDING_REVIEW": {  # Backward compatibility
        KycWorkflowStatus.APPROVED.value,
        KycWorkflowStatus.REJECTED.value,
        KycWorkflowStatus.AWAITING_FACE_VERIFICATION.value,
        KycWorkflowStatus.PENDING_ADMIN_REVIEW.value,
        KycWorkflowStatus.CANCELLED.value,
    },
    # Terminal States
    KycWorkflowStatus.APPROVED.value: set(),
    KycWorkflowStatus.REJECTED.value: {
        KycWorkflowStatus.DOCUMENT_UPLOADED.value,  # Allowed to re-apply
        KycWorkflowStatus.CANCELLED.value,
    },
    KycWorkflowStatus.CANCELLED.value: set(),
}


class KycWorkflowService:
    """Service governing KYC session state transitions and administrative reviews."""

    @classmethod
    def validate_transition(cls, current_status: str, target_status: str) -> None:
        """Verify that a requested status transition is legally permitted by the state machine."""
        allowed_targets = VALID_TRANSITIONS.get(current_status, set())
        if target_status not in allowed_targets:
            logger.warning(
                "Illegal KYC transition attempted: %s -> %s (Allowed: %s)",
                current_status,
                target_status,
                allowed_targets,
            )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid KYC workflow transition from '{current_status}' to '{target_status}'.",
            )

    @classmethod
    def transition_session(
        cls,
        session: KycSession,
        target_status: str,
        db: Session,
        actor_id: uuid.UUID | None = None,
        action: str | None = None,
        notes: str | None = None,
    ) -> KycSession:
        """Safely transition session status, update timestamps, and record an audit log entry."""
        current_status = session.workflow_status or session.status
        cls.validate_transition(current_status, target_status)

        session.workflow_status = target_status
        session.status = target_status
        session.updated_at = datetime.now(timezone.utc)

        audit_action = action or f"KYC_STATUS_CHANGED_TO_{target_status}"
        audit_entry = AuditLog(
            user_id=actor_id,
            action=audit_action,
            resource_type="kyc_session",
            resource_id=str(session.id),
        )
        db.add(audit_entry)
        db.flush()

        logger.info(
            "KYC Session %s transitioned: %s -> %s (Actor: %s)",
            session.id,
            current_status,
            target_status,
            actor_id,
        )
        return session

    @classmethod
    def submit_for_admin_review(
        cls,
        session: KycSession,
        customer: User,
        db: Session,
    ) -> KycSession:
        """Submit a completed verification session for administrator compliance review."""
        # Enforce session ownership
        if session.user_id != customer.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: cannot submit a session belonging to another user.",
            )

        current = session.workflow_status or session.status
        if current in (KycWorkflowStatus.APPROVED.value, KycWorkflowStatus.CANCELLED.value):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot submit session in '{current}' state for review.",
            )

        session.admin_review_status = "PENDING"
        cls.transition_session(
            session,
            target_status=KycWorkflowStatus.PENDING_ADMIN_REVIEW.value,
            db=db,
            actor_id=customer.id,
            action="KYC_SUBMITTED_FOR_REVIEW",
        )
        db.commit()
        db.refresh(session)
        return session

    @classmethod
    def admin_review_decision(
        cls,
        session: KycSession,
        decision: str,
        reason: str | None,
        admin: User,
        db: Session,
    ) -> KycSession:
        """Process an Administrator's final verification approval or rejection decision."""
        # Verify administrator authority
        if not admin.role or admin.role.name != "ADMIN":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Administrative privileges required to review KYC sessions.",
            )

        if decision not in ("APPROVED", "REJECTED"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Decision must be either 'APPROVED' or 'REJECTED'.",
            )

        current = session.workflow_status or session.status
        if current == KycWorkflowStatus.APPROVED.value:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This KYC session is already APPROVED and cannot be modified.",
            )
        if current == KycWorkflowStatus.CANCELLED.value:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This KYC session has been CANCELLED and cannot be reviewed.",
            )
        if session.admin_review_status == decision:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"This KYC session has already been finalized as {decision}.",
            )

        now = datetime.now(timezone.utc)
        session.admin_reviewed_by = admin.id
        session.admin_reviewed_at = now

        if decision == "REJECTED":
            # Mandatory meaningful rejection reason validation
            if not reason or not reason.strip() or len(reason.strip()) < 3:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="A valid explanation reason is mandatory when rejecting a KYC session (at least 3 characters required).",
                )
            session.rejection_reason = reason.strip()
            session.failure_reason = reason.strip()
            session.admin_review_status = "REJECTED"

            # Transition status
            session.workflow_status = KycWorkflowStatus.REJECTED.value
            session.status = KycWorkflowStatus.REJECTED.value
            session.face_verified = False

            # Update customer account status
            if session.user:
                session.user.is_verified = False

            audit_action = "ADMIN_REJECTED_KYC"

        else:  # APPROVED
            session.admin_review_status = "APPROVED"
            session.workflow_status = KycWorkflowStatus.APPROVED.value
            session.status = KycWorkflowStatus.APPROVED.value
            session.face_verified = True

            # Mark user as officially verified
            if session.user:
                session.user.is_verified = True

            audit_action = "ADMIN_APPROVED_KYC"

        session.updated_at = now

        # Add audit entry within the same atomic transaction
        audit_entry = AuditLog(
            user_id=admin.id,
            action=audit_action,
            resource_type="kyc_session",
            resource_id=str(session.id),
        )
        db.add(audit_entry)

        try:
            db.commit()
            db.refresh(session)
        except Exception as exc:
            db.rollback()
            logger.error("Transaction failed during admin review for session %s: %s", session.id, exc)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Database transaction failed during administrative review.",
            ) from exc

        logger.info(
            "Admin %s executed decision %s for session %s (user %s)",
            admin.id,
            decision,
            session.id,
            session.user_id,
        )
        return session

    @classmethod
    def cancel_session(
        cls,
        session: KycSession,
        actor: User,
        db: Session,
        reason: str | None = None,
    ) -> KycSession:
        """Cancel an in-progress or pending KYC session."""
        # RBAC Check: Only session owner or Admin can cancel
        is_admin = actor.role and actor.role.name == "ADMIN"
        if session.user_id != actor.id and not is_admin:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: cannot cancel a session belonging to another user.",
            )

        current = session.workflow_status or session.status
        if current == KycWorkflowStatus.APPROVED.value:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot cancel an already APPROVED KYC session.",
            )
        if current == KycWorkflowStatus.CANCELLED.value:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This KYC session is already CANCELLED.",
            )

        cancellation_msg = reason.strip() if reason and reason.strip() else "Session cancelled by user."
        session.failure_reason = cancellation_msg
        cls.transition_session(
            session,
            target_status=KycWorkflowStatus.CANCELLED.value,
            db=db,
            actor_id=actor.id,
            action="KYC_SESSION_CANCELLED",
        )
        db.commit()
        db.refresh(session)
        return session
