"""Automated tests for AI-Based Biometric Face Verification (DeepFace + FaceNet)."""

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


def create_test_image_bytes(width: int = 200, height: int = 200, color: tuple = (180, 180, 180)) -> bytes:
    """Generate a clean synthetic JPEG image."""
    img = Image.new("RGB", (width, height), color=color)
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


@pytest.fixture
def auth_customer(db_session):
    """Create and return a Customer user and valid JWT access token."""
    customer = User(
        full_name="Face Test Customer",
        email=f"facetest_{uuid.uuid4().hex[:6]}@example.com",
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
def other_customer(db_session):
    """Create and return a second Customer user and JWT token for RBAC tests."""
    other = User(
        full_name="Other Customer",
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
    """Create and return an Admin user and valid JWT access token."""
    admin = User(
        full_name="System Admin",
        email=f"admin_{uuid.uuid4().hex[:6]}@example.com",
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


@pytest.fixture
def customer_session(db_session, auth_customer):
    """Create an approved OCR session ready for biometric face verification."""
    customer, _ = auth_customer
    session = KycSession(
        user_id=customer.id,
        document_type="PAN",
        status="PENDING_REVIEW",
        workflow_status="AWAITING_FACE_VERIFICATION",
        document_number_masked="ABCDE****F",
        extracted_name="Face Test Customer",
        ocr_confidence=0.95,
    )
    db_session.add(session)
    db_session.commit()
    db_session.refresh(session)
    return session


def test_face_verification_success_match(client, db_session, auth_customer, customer_session):
    """Verify facial match updates session, user verification, cleans up temp crop, and logs audit."""
    customer, token = auth_customer

    # Seed temporary document face crop
    dummy_doc_face = np.ones((160, 160, 3), dtype=np.uint8) * 128
    temp_path = FaceVerificationService.get_temp_face_path(customer_session.id)
    cv2.imwrite(str(temp_path), dummy_doc_face)
    assert temp_path.exists()

    selfie_bytes = create_test_image_bytes()
    dummy_selfie_crop = np.ones((160, 160, 3), dtype=np.uint8) * 128

    with patch.object(
        FaceVerificationService,
        "extract_selfie_face",
        return_value=(dummy_selfie_crop, ["Face successfully detected."]),
    ), patch.object(
        FaceVerificationService,
        "compare_faces",
        return_value={
            "distance": 0.15,
            "threshold": 0.40,
            "is_match": True,
            "similarity_score": 85.0,
            "model": "Facenet",
        },
    ):
        response = client.post(
            f"/api/v1/kyc/sessions/{customer_session.id}/verify-face",
            headers={"Authorization": f"Bearer {token}"},
            data={"consent": "true"},
            files={"selfie": ("selfie.jpg", selfie_bytes, "image/jpeg")},
        )

    assert response.status_code == 200
    data = response.json()
    assert data["session_id"] == str(customer_session.id)
    assert data["is_match"] is True
    assert data["similarity_score"] == 85.0
    assert data["distance"] == 0.15
    assert data["threshold"] == 0.40
    assert data["face_detected_document"] is True
    assert data["face_detected_selfie"] is True
    assert data["liveness_status"] == "UNASSESSED"
    assert any("Liveness anti-spoofing not assessed" in msg for msg in data["validation_messages"])

    # Verify temp face file was cleaned up
    assert not temp_path.exists()

    # Verify DB session record
    db_session.refresh(customer_session)
    assert customer_session.face_verified is True
    assert customer_session.face_match_status == "MATCH"
    assert customer_session.face_match_score == 85.0
    assert customer_session.biometric_consent is True
    assert customer_session.status in ("APPROVED", "FACE_MATCHED")
    assert customer_session.workflow_status in ("FACE_MATCHED", "APPROVED")

    # Verify user is not prematurely verified before Admin review (Task 06 constraint)
    db_session.refresh(customer)
    assert customer.is_verified is False

    # Verify audit log recorded
    logs = db_session.execute(
        select(AuditLog).where(
            AuditLog.resource_id == str(customer_session.id),
            AuditLog.action == "BIOMETRIC_FACE_VERIFICATION",
        )
    ).scalars().all()
    assert len(logs) == 1


def test_face_verification_mismatch(client, db_session, auth_customer, customer_session):
    """Verify facial mismatch rejects session and records honest failure reason."""
    customer, token = auth_customer

    dummy_doc_face = np.ones((160, 160, 3), dtype=np.uint8) * 128
    temp_path = FaceVerificationService.get_temp_face_path(customer_session.id)
    cv2.imwrite(str(temp_path), dummy_doc_face)

    selfie_bytes = create_test_image_bytes()
    dummy_selfie_crop = np.ones((160, 160, 3), dtype=np.uint8) * 200

    with patch.object(
        FaceVerificationService,
        "extract_selfie_face",
        return_value=(dummy_selfie_crop, ["Single face detected."]),
    ), patch.object(
        FaceVerificationService,
        "compare_faces",
        return_value={
            "distance": 0.65,
            "threshold": 0.40,
            "is_match": False,
            "similarity_score": 35.0,
            "model": "Facenet",
        },
    ):
        response = client.post(
            f"/api/v1/kyc/sessions/{customer_session.id}/verify-face",
            headers={"Authorization": f"Bearer {token}"},
            data={"consent": "true"},
            files={"selfie": ("selfie.jpg", selfie_bytes, "image/jpeg")},
        )

    assert response.status_code == 200
    data = response.json()
    assert data["is_match"] is False
    assert data["similarity_score"] == 35.0
    assert data["status"] == "REJECTED"

    db_session.refresh(customer_session)
    assert customer_session.status == "REJECTED"
    assert customer_session.face_verified is False
    assert customer_session.face_match_status == "NO_MATCH"
    assert "similarity 35.0%" in customer_session.failure_reason


def test_face_verification_missing_consent(client, auth_customer, customer_session):
    """Verify request without explicit biometric consent is rejected with 400 Bad Request."""
    _, token = auth_customer
    selfie_bytes = create_test_image_bytes()

    response = client.post(
        f"/api/v1/kyc/sessions/{customer_session.id}/verify-face",
        headers={"Authorization": f"Bearer {token}"},
        data={"consent": "false"},
        files={"selfie": ("selfie.jpg", selfie_bytes, "image/jpeg")},
    )
    assert response.status_code == 400
    assert "Biometric consent is mandatory" in response.json()["detail"]


def test_face_verification_no_face_in_selfie(client, auth_customer, customer_session):
    """Verify selfie without detectable face returns 422 Unprocessable Entity."""
    _, token = auth_customer
    dummy_doc_face = np.ones((160, 160, 3), dtype=np.uint8) * 128
    temp_path = FaceVerificationService.get_temp_face_path(customer_session.id)
    cv2.imwrite(str(temp_path), dummy_doc_face)

    # Blank solid image has no faces
    blank_bytes = create_test_image_bytes()

    with patch.object(FaceVerificationService, "count_faces", return_value=0):
        response = client.post(
            f"/api/v1/kyc/sessions/{customer_session.id}/verify-face",
            headers={"Authorization": f"Bearer {token}"},
            data={"consent": "true"},
            files={"selfie": ("selfie.jpg", blank_bytes, "image/jpeg")},
        )

    assert response.status_code == 422
    assert "No human face detected" in response.json()["detail"]

    FaceVerificationService.cleanup_cached_document_face(customer_session.id)


def test_face_verification_multiple_faces(client, auth_customer, customer_session):
    """Verify selfie with multiple faces returns 422 Unprocessable Entity."""
    _, token = auth_customer
    dummy_doc_face = np.ones((160, 160, 3), dtype=np.uint8) * 128
    temp_path = FaceVerificationService.get_temp_face_path(customer_session.id)
    cv2.imwrite(str(temp_path), dummy_doc_face)

    selfie_bytes = create_test_image_bytes()

    with patch.object(FaceVerificationService, "count_faces", return_value=3):
        response = client.post(
            f"/api/v1/kyc/sessions/{customer_session.id}/verify-face",
            headers={"Authorization": f"Bearer {token}"},
            data={"consent": "true"},
            files={"selfie": ("selfie.jpg", selfie_bytes, "image/jpeg")},
        )

    assert response.status_code == 422
    assert "Multiple faces detected (3)" in response.json()["detail"]

    FaceVerificationService.cleanup_cached_document_face(customer_session.id)


def test_face_verification_forbidden_different_user(client, other_customer, customer_session):
    """Verify customer cannot verify a session belonging to another user (403 Forbidden)."""
    _, other_token = other_customer
    selfie_bytes = create_test_image_bytes()

    response = client.post(
        f"/api/v1/kyc/sessions/{customer_session.id}/verify-face",
        headers={"Authorization": f"Bearer {other_token}"},
        data={"consent": "true"},
        files={"selfie": ("selfie.jpg", selfie_bytes, "image/jpeg")},
    )
    assert response.status_code == 403
    assert "belongs to another user" in response.json()["detail"]


def test_face_verification_admin_authorized(client, auth_admin, customer_session):
    """Verify Admin can trigger face verification on any customer session."""
    _, admin_token = auth_admin
    dummy_doc_face = np.ones((160, 160, 3), dtype=np.uint8) * 128
    temp_path = FaceVerificationService.get_temp_face_path(customer_session.id)
    cv2.imwrite(str(temp_path), dummy_doc_face)

    selfie_bytes = create_test_image_bytes()
    dummy_selfie_crop = np.ones((160, 160, 3), dtype=np.uint8) * 128

    with patch.object(
        FaceVerificationService,
        "extract_selfie_face",
        return_value=(dummy_selfie_crop, ["Single face detected."]),
    ), patch.object(
        FaceVerificationService,
        "compare_faces",
        return_value={
            "distance": 0.10,
            "threshold": 0.40,
            "is_match": True,
            "similarity_score": 90.0,
            "model": "Facenet",
        },
    ):
        response = client.post(
            f"/api/v1/kyc/sessions/{customer_session.id}/verify-face",
            headers={"Authorization": f"Bearer {admin_token}"},
            data={"consent": "true"},
            files={"selfie": ("selfie.jpg", selfie_bytes, "image/jpeg")},
        )

    assert response.status_code == 200
    assert response.json()["is_match"] is True


def test_face_verification_no_cached_document_face(client, auth_customer, customer_session):
    """Verify error when session has no document face cached and no document fallback given."""
    _, token = auth_customer
    FaceVerificationService.cleanup_cached_document_face(customer_session.id)

    selfie_bytes = create_test_image_bytes()

    response = client.post(
        f"/api/v1/kyc/sessions/{customer_session.id}/verify-face",
        headers={"Authorization": f"Bearer {token}"},
        data={"consent": "true"},
        files={"selfie": ("selfie.jpg", selfie_bytes, "image/jpeg")},
    )
    assert response.status_code == 400
    assert "No document face photo found" in response.json()["detail"]


def test_face_verification_session_not_found(client, auth_customer):
    """Verify 404 Not Found for non-existent session UUID."""
    _, token = auth_customer
    selfie_bytes = create_test_image_bytes()

    random_id = uuid.uuid4()
    response = client.post(
        f"/api/v1/kyc/sessions/{random_id}/verify-face",
        headers={"Authorization": f"Bearer {token}"},
        data={"consent": "true"},
        files={"selfie": ("selfie.jpg", selfie_bytes, "image/jpeg")},
    )
    assert response.status_code == 404
    assert "KYC session not found" in response.json()["detail"]


def test_face_service_real_comparison_local():
    """Verify FaceVerificationService.compare_faces runs locally and computes correct distance."""
    face1 = np.ones((160, 160, 3), dtype=np.uint8) * 128
    face2 = np.ones((160, 160, 3), dtype=np.uint8) * 128

    result = FaceVerificationService.compare_faces(face1, face2, threshold=0.40)
    assert result["is_match"] is True
    assert result["distance"] == 0.0
    assert result["similarity_score"] == 100.0
    assert result["model"] == "Facenet"
