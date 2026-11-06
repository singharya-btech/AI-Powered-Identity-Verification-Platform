"""KYC Verification Session model.

Contains session metadata only. Never stores raw Aadhaar/PAN numbers,
identity images, or biometric embeddings.
"""

import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING
from sqlalchemy import Boolean, DateTime, Float, ForeignKey, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.db.base import Base

if TYPE_CHECKING:
    from backend.app.models.user import User


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class KycSession(Base):
    """KYC Verification Session tracking entity."""

    __tablename__ = "kyc_sessions"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    document_type: Mapped[str] = mapped_column(String(50), nullable=False)  # PAN, AADHAAR
    status: Mapped[str] = mapped_column(String(50), default="PENDING", nullable=False)  # PENDING, PROCESSING, APPROVED, REJECTED, FAILED

    # Privacy-conscious metadata (Zero raw PAN/Aadhaar stored)
    document_number_masked: Mapped[str | None] = mapped_column(String(50), nullable=True)
    extracted_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    extracted_dob: Mapped[str | None] = mapped_column(String(50), nullable=True)
    extracted_gender: Mapped[str | None] = mapped_column(String(20), nullable=True)
    ocr_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    failure_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Biometric Face Verification metadata (Zero raw selfies or embeddings stored)
    face_match_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    face_match_status: Mapped[str | None] = mapped_column(String(50), nullable=True)
    face_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    biometric_consent: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Centralized KYC Workflow & Administrator Review
    workflow_status: Mapped[str] = mapped_column(String(50), default="NOT_STARTED", index=True, nullable=False)
    admin_review_status: Mapped[str | None] = mapped_column(String(50), nullable=True)
    admin_reviewed_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    admin_reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    rejection_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        index=True,
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
        nullable=False,
    )

    # Relationships
    user: Mapped["User"] = relationship("User", foreign_keys=[user_id], back_populates="kyc_sessions")
    admin_reviewer: Mapped["User | None"] = relationship("User", foreign_keys=[admin_reviewed_by])

    def __repr__(self) -> str:
        return f"<KycSession(id={self.id}, user_id={self.user_id}, status='{self.status}')>"

