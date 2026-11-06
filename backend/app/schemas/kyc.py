"""Pydantic schemas for KYC Sessions and Document OCR Extraction."""

import uuid
from datetime import datetime
from typing import Any, Literal
from pydantic import BaseModel, ConfigDict, Field


class KycSessionBase(BaseModel):
    document_type: Literal["PAN", "AADHAAR"] = Field(description="Identity document type")


class KycSessionCreate(KycSessionBase):
    pass


class AuditLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    action: str
    resource_type: str
    resource_id: str | None = None
    timestamp: datetime


class AdminReviewRequest(BaseModel):
    decision: Literal["APPROVED", "REJECTED"] = Field(description="Administrator verification decision")
    reason: str | None = Field(default=None, description="Mandatory explanation if rejected")


class KycCancelRequest(BaseModel):
    reason: str | None = Field(default=None, description="Cancellation reason")


class KycSessionResponse(KycSessionBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    status: str
    workflow_status: str | None = None
    admin_review_status: str | None = None
    admin_reviewed_by: uuid.UUID | None = None
    admin_reviewed_at: datetime | None = None
    rejection_reason: str | None = None
    document_number_masked: str | None = None
    extracted_name: str | None = None
    extracted_dob: str | None = None
    extracted_gender: str | None = None
    ocr_confidence: float | None = None
    failure_reason: str | None = None
    face_match_score: float | None = None
    face_match_status: str | None = None
    face_verified: bool = False
    biometric_consent: bool = False
    customer_name: str | None = None
    customer_email: str | None = None
    admin_reviewer_name: str | None = None
    audit_logs: list[AuditLogResponse] = []
    created_at: datetime
    updated_at: datetime


class PaginatedKycSessionsResponse(BaseModel):
    """Server-side paginated verification sessions list."""

    items: list[KycSessionResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


class AdminAnalyticsResponse(BaseModel):
    """PostgreSQL-backed aggregate compliance telemetry."""

    total_customers: int
    total_applications: int
    pending_applications: int
    approved_applications: int
    rejected_applications: int
    cancelled_applications: int
    face_matches: int
    face_mismatches: int
    submitted_today: int
    submitted_this_week: int
    status_breakdown: dict[str, int] = Field(default_factory=dict)


class KycStatusUpdate(BaseModel):
    status: Literal["PENDING", "PROCESSING", "APPROVED", "REJECTED", "FAILED"]
    failure_reason: str | None = None


class DocumentOcrResponse(BaseModel):
    """Clean, privacy-preserving structured OCR extraction response."""

    session_id: uuid.UUID = Field(description="KYC session identifier")
    document_type: Literal["PAN", "AADHAAR"] = Field(description="Processed document type")
    status: str = Field(description="Session status: APPROVED, PENDING_REVIEW, REJECTED, FAILED")
    document_number_masked: str | None = Field(
        default=None,
        description="Masked document ID (e.g. ABCDE****F or XXXX-XXXX-1234)",
    )
    extracted_name: str | None = Field(default=None, description="Extracted cardholder name")
    extracted_dob: str | None = Field(default=None, description="Extracted date or year of birth")
    extracted_gender: str | None = Field(default=None, description="Extracted gender if present")
    extracted_fields: dict[str, Any] = Field(
        default_factory=dict,
        description="Dictionary of sanitized extracted key-value pairs",
    )
    is_format_valid: bool = Field(description="Whether the document structure matches standard format")
    confidence_score: float = Field(description="OCR detection confidence score between 0.0 and 1.0")
    validation_messages: list[str] = Field(
        default_factory=list,
        description="List of verification findings or format alerts",
    )
    created_at: datetime


class FaceVerificationResponse(BaseModel):
    """Structured response for AI biometric face matching."""

    session_id: uuid.UUID = Field(description="KYC session identifier")
    status: str = Field(description="KYC session status")
    face_detected_document: bool = Field(description="Whether a valid face portrait was detected in identity document")
    face_detected_selfie: bool = Field(description="Whether a single valid face was detected in live selfie")
    similarity_score: float | None = Field(default=None, description="Similarity percentage between 0.0 and 100.0")
    distance: float | None = Field(default=None, description="Raw cosine distance (lower is closer)")
    threshold: float = Field(default=0.40, description="Cosine distance threshold applied for match")
    is_match: bool = Field(description="Whether face match criteria are met")
    liveness_status: str = Field(
        default="UNASSESSED",
        description="Liveness verification status. Standard webcam capture does not assess anti-spoofing.",
    )
    validation_messages: list[str] = Field(
        default_factory=list,
        description="Findings, warnings, or honest verification notes",
    )
    timestamp: datetime = Field(description="Verification timestamp")
