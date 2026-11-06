"""Automated tests for KYC Document Upload and Local OCR Processing."""

import io
import uuid
import cv2
import numpy as np
import pytest
from PIL import Image, ImageDraw
from sqlalchemy import select
from starlette.testclient import TestClient

from backend.app.core.security import create_access_token
from backend.app.main import create_application
from backend.app.models.audit_log import AuditLog
from backend.app.models.kyc_session import KycSession
from backend.app.models.role import Role
from backend.app.models.user import User


def create_synthetic_document_image(text_lines: list[str], width: int = 400, height: int = 250) -> bytes:
    """Generate a clean synthetic document image containing specified text lines."""
    img = Image.new("RGB", (width, height), color=(245, 245, 245))
    draw = ImageDraw.Draw(img)

    # Draw border
    draw.rectangle([5, 5, width - 5, height - 5], outline=(100, 100, 100), width=2)

    # Draw text lines
    y_offset = 20
    for line in text_lines:
        draw.text((20, y_offset), line, fill=(0, 0, 0))
        y_offset += 30

    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


@pytest.fixture
def auth_customer(db_session):
    """Create and return a Customer user and valid JWT access token."""
    customer = User(
        full_name="Verified Test Customer",
        email=f"customer_{uuid.uuid4().hex[:6]}@example.com",
        password_hash="$2b$12$eXampleHashedPasswordValue1234567890123456789012",
        role_id=2,  # CUSTOMER
        is_active=True,
        is_verified=False,
    )
    db_session.add(customer)
    db_session.commit()
    db_session.refresh(customer)

    token = create_access_token(
        subject=str(customer.id),
        extra_claims={"role": "CUSTOMER", "email": customer.email},
    )
    return customer, token


@pytest.fixture
def auth_admin(db_session):
    """Create and return an Admin user and valid JWT access token."""
    admin = User(
        full_name="Admin Reviewer",
        email=f"admin_{uuid.uuid4().hex[:6]}@ekyc.local",
        password_hash="$2b$12$eXampleHashedPasswordValue1234567890123456789012",
        role_id=1,  # ADMIN
        is_active=True,
        is_verified=True,
    )
    db_session.add(admin)
    db_session.commit()
    db_session.refresh(admin)

    token = create_access_token(
        subject=str(admin.id),
        extra_claims={"role": "ADMIN", "email": admin.email},
    )
    return admin, token


# ==============================================================================
# 1. Validation & Integrity Tests
# ==============================================================================

def test_upload_missing_auth_token_rejected(client):
    """Unauthenticated document upload requests must be rejected with HTTP 401."""
    dummy_img = create_synthetic_document_image(["PAN CARD", "ABCDE1234F"])
    response = client.post(
        "/api/v1/kyc/document/upload",
        data={"document_type": "PAN"},
        files={"file": ("pan.jpg", dummy_img, "image/jpeg")},
    )
    assert response.status_code == 401


def test_upload_invalid_file_extension_rejected(client, auth_customer):
    """Uploading files with non-image extensions (e.g. .pdf, .txt) must be rejected with HTTP 400."""
    _, token = auth_customer
    response = client.post(
        "/api/v1/kyc/document/upload",
        headers={"Authorization": f"Bearer {token}"},
        data={"document_type": "PAN"},
        files={"file": ("document.pdf", b"%PDF-1.4 fake pdf bytes", "image/jpeg")},
    )
    assert response.status_code == 400
    assert "Invalid file extension" in response.json()["detail"]


def test_upload_invalid_mime_type_rejected(client, auth_customer):
    """Uploading files with prohibited MIME types must be rejected with HTTP 400."""
    _, token = auth_customer
    response = client.post(
        "/api/v1/kyc/document/upload",
        headers={"Authorization": f"Bearer {token}"},
        data={"document_type": "PAN"},
        files={"file": ("document.jpg", b"fake bytes", "application/pdf")},
    )
    assert response.status_code == 400
    assert "Invalid MIME type" in response.json()["detail"]


def test_upload_oversized_file_rejected(client, auth_customer):
    """Uploading files exceeding 5MB must be rejected with HTTP 413."""
    _, token = auth_customer
    large_payload = b"X" * (6 * 1024 * 1024)  # 6 MB
    response = client.post(
        "/api/v1/kyc/document/upload",
        headers={"Authorization": f"Bearer {token}"},
        data={"document_type": "PAN"},
        files={"file": ("large.jpg", large_payload, "image/jpeg")},
    )
    assert response.status_code == 413
    assert "exceeds maximum allowed size" in response.json()["detail"]


def test_upload_corrupted_image_rejected(client, auth_customer):
    """Corrupted image files that fail OpenCV decoding must be rejected with HTTP 400."""
    _, token = auth_customer
    corrupted_bytes = b"NOT_AN_IMAGE_RANDOM_GARBAGE_BYTES_12345"
    response = client.post(
        "/api/v1/kyc/document/upload",
        headers={"Authorization": f"Bearer {token}"},
        data={"document_type": "PAN"},
        files={"file": ("corrupt.jpg", corrupted_bytes, "image/jpeg")},
    )
    assert response.status_code == 400
    assert "Corrupted or unreadable image" in response.json()["detail"]


def test_upload_low_resolution_image_rejected(client, auth_customer):
    """Tiny images under 100x100 resolution must be rejected with HTTP 400."""
    _, token = auth_customer
    tiny_img = create_synthetic_document_image(["tiny"], width=50, height=50)
    response = client.post(
        "/api/v1/kyc/document/upload",
        headers={"Authorization": f"Bearer {token}"},
        data={"document_type": "PAN"},
        files={"file": ("tiny.jpg", tiny_img, "image/jpeg")},
    )
    assert response.status_code == 400
    assert "resolution too low" in response.json()["detail"]


# ==============================================================================
# 2. OCR Processing & Data Minimization Tests
# ==============================================================================

def test_upload_pan_document_success_and_masked_persistence(client, auth_customer, db_session, monkeypatch):
    """Test valid PAN document upload, OCR parsing, masking, and audit record creation."""
    customer, token = auth_customer

    # Mock OCR extraction to return deterministic recognized text
    def mock_extract(img, *args, **kwargs):
        return (
            "INCOME TAX DEPARTMENT|GOVT OF INDIA|PERMANENT ACCOUNT NUMBER|ABCDE1234F|NAME JOHN DOE|FATHERS NAME RICHARD DOE|DOB 15/08/1990",
            0.88,
            ["INCOME TAX DEPARTMENT", "ABCDE1234F", "NAME JOHN DOE"],
        )

    monkeypatch.setattr("backend.app.services.ocr_service.extract_text_with_details", mock_extract)

    valid_img = create_synthetic_document_image(["INCOME TAX", "ABCDE1234F", "NAME JOHN DOE"])
    response = client.post(
        "/api/v1/kyc/document/upload",
        headers={"Authorization": f"Bearer {token}"},
        data={"document_type": "PAN"},
        files={"file": ("pan_card.jpg", valid_img, "image/jpeg")},
    )

    assert response.status_code == 200
    data = response.json()

    # Verify structured response
    assert data["document_type"] == "PAN"
    assert data["status"] in {"APPROVED", "PENDING_REVIEW"}
    assert data["is_format_valid"] is True
    assert data["confidence_score"] == 0.88

    # Assert raw PAN is NOT exposed in response (must be masked as ABCDE****F)
    assert data["document_number_masked"] == "ABCDE****F"
    assert "ABCDE1234F" not in str(data["document_number_masked"])

    # Assert database stores ONLY masked number and zero raw PII
    session_id = data["session_id"]
    saved_session = db_session.execute(
        select(KycSession).where(KycSession.id == uuid.UUID(session_id))
    ).scalar_one()

    assert saved_session.document_number_masked == "ABCDE****F"
    assert saved_session.user_id == customer.id

    # Verify audit log entry exists
    audit_entry = db_session.execute(
        select(AuditLog).where(AuditLog.resource_id == str(session_id))
    ).scalar_one_or_none()
    assert audit_entry is not None
    assert audit_entry.action == "DOCUMENT_OCR_PROCESSED"
    assert audit_entry.user_id == customer.id


def test_upload_aadhaar_document_success_and_masked_persistence(client, auth_customer, db_session, monkeypatch):
    """Test valid Aadhaar document upload, OCR parsing, 12-digit format check, and masking."""
    customer, token = auth_customer

    def mock_extract(img, *args, **kwargs):
        return (
            "GOVERNMENT OF INDIA|1234 5678 9012|JOHN DOE|DOB 01/01/1990|MALE",
            0.92,
            ["GOVERNMENT OF INDIA", "1234 5678 9012"],
        )

    monkeypatch.setattr("backend.app.services.ocr_service.extract_text_with_details", mock_extract)

    valid_img = create_synthetic_document_image(["AADHAAR", "1234 5678 9012", "JOHN DOE"])
    response = client.post(
        "/api/v1/kyc/document/upload",
        headers={"Authorization": f"Bearer {token}"},
        data={"document_type": "AADHAAR"},
        files={"file": ("aadhaar.jpg", valid_img, "image/jpeg")},
    )

    assert response.status_code == 200
    data = response.json()

    assert data["document_type"] == "AADHAAR"
    assert data["status"] in {"APPROVED", "PENDING_REVIEW"}
    assert data["is_format_valid"] is True

    # Assert raw 12 digits are masked to XXXX-XXXX-9012
    assert data["document_number_masked"] == "XXXX-XXXX-9012"
    assert "123456789012" not in str(data["document_number_masked"])

    # Verify user verified status is NOT prematurely updated before Admin review (Task 06 constraint)
    refreshed_customer = db_session.execute(
        select(User).where(User.id == customer.id)
    ).scalar_one()
    assert refreshed_customer.is_verified is False


def test_document_mismatch_detected(client, auth_customer, monkeypatch):
    """Uploading an Aadhaar image when PAN is selected triggers a mismatch validation message."""
    _, token = auth_customer

    def mock_extract(img, *args, **kwargs):
        # Image contains Aadhaar 12-digit number, but user requested PAN
        return ("GOVERNMENT OF INDIA|1234 5678 9012", 0.75, ["1234 5678 9012"])

    monkeypatch.setattr("backend.app.services.ocr_service.extract_text_with_details", mock_extract)

    img_bytes = create_synthetic_document_image(["AADHAAR", "1234 5678 9012"])
    response = client.post(
        "/api/v1/kyc/document/upload",
        headers={"Authorization": f"Bearer {token}"},
        data={"document_type": "PAN"},
        files={"file": ("mismatch.jpg", img_bytes, "image/jpeg")},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["is_format_valid"] is False
    assert any("mismatch" in msg.lower() for msg in data["validation_messages"])


# ==============================================================================
# 3. Session Querying & RBAC Tests
# ==============================================================================

def test_customer_can_retrieve_own_sessions(client, auth_customer, db_session):
    """Customer can retrieve the list of their own KYC sessions."""
    customer, token = auth_customer

    # Create dummy session
    sess = KycSession(
        user_id=customer.id,
        document_type="PAN",
        status="APPROVED",
        document_number_masked="ABCDE****F",
        extracted_name="Verified Name",
    )
    db_session.add(sess)
    db_session.commit()

    response = client.get(
        "/api/v1/kyc/sessions/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    sessions = response.json()
    assert len(sessions) >= 1
    assert sessions[0]["document_number_masked"] == "ABCDE****F"


def test_customer_forbidden_from_admin_sessions_endpoint(client, auth_customer):
    """Customer cannot access /api/v1/kyc/admin/sessions (HTTP 403)."""
    _, customer_token = auth_customer
    response = client.get(
        "/api/v1/kyc/admin/sessions",
        headers={"Authorization": f"Bearer {customer_token}"},
    )
    assert response.status_code == 403
    assert "Administrator access required" in response.json()["detail"]


def test_admin_can_access_admin_sessions_endpoint(client, auth_admin):
    """Admin can access /api/v1/kyc/admin/sessions (HTTP 200)."""
    _, admin_token = auth_admin
    response = client.get(
        "/api/v1/kyc/admin/sessions",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 200
    assert isinstance(response.json(), list)
