"""Tests for Prometheus metrics instrumentation in FastAPI backend.

Verifies:
- GET /metrics returns 200 OK with Prometheus exposition format.
- All defined metrics (HTTP, OCR, Face, Workflow) are exposed.
- Path normalization prevents cardinality explosion for UUIDs and IDs.
- Zero raw PII or sensitive tokens leaked in metric output.
"""

import uuid
import pytest
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.core.metrics import normalize_endpoint


@pytest.fixture
def client():
    return TestClient(app)


def test_metrics_endpoint_accessible(client):
    """GET /metrics returns 200 OK and Prometheus exposition text format."""
    response = client.get("/metrics")
    assert response.status_code == 200
    assert "text/plain" in response.headers.get("content-type", "")
    content = response.text

    # Verify standard metrics and custom eKYC metrics are present
    assert "http_requests_total" in content
    assert "http_request_duration_seconds" in content
    assert "http_active_requests" in content
    assert "application_errors_total" in content
    assert "kyc_document_uploads_total" in content
    assert "kyc_ocr_duration_seconds" in content
    assert "kyc_face_verifications_total" in content
    assert "kyc_face_verification_duration_seconds" in content
    assert "kyc_workflow_status_count" in content


def test_path_normalization():
    """Verify endpoint normalizer replaces UUIDs and numeric IDs to ensure low cardinality."""
    # Test UUID normalization
    test_uuid = str(uuid.uuid4())
    raw_path = f"/api/v1/kyc/sessions/{test_uuid}/review"
    normalized = normalize_endpoint(raw_path)
    assert normalized == "/api/v1/kyc/sessions/{session_id}/review"
    assert test_uuid not in normalized

    # Test numeric ID normalization
    numeric_path = "/api/v1/users/42/details"
    normalized_numeric = normalize_endpoint(numeric_path)
    assert normalized_numeric == "/api/v1/users/{id}/details"
    assert "42" not in normalized_numeric

    # Test standard paths remain unchanged
    assert normalize_endpoint("/api/v1/auth/login") == "/api/v1/auth/login"
    assert normalize_endpoint("/api/v1/kyc/upload") == "/api/v1/kyc/upload"
    assert normalize_endpoint("/health") == "/health"
    assert normalize_endpoint("/metrics") == "/metrics"


def test_metrics_no_pii_leakage(client):
    """Verify that metric text does not leak sensitive information (passwords, tokens, names)."""
    # Trigger a health check to record some metrics
    client.get("/health")
    response = client.get("/metrics")
    assert response.status_code == 200
    content = response.text

    forbidden_substrings = [
        "password",
        "secret_key",
        "bearer ",
        "authorization",
        "aadhaar_number",
        "pan_number",
    ]
    for forbidden in forbidden_substrings:
        assert forbidden not in content.lower(), f"Potential PII or secret found in /metrics: {forbidden}"
