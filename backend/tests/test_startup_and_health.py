"""Tests for application startup and health check endpoints."""

from unittest.mock import patch
from fastapi.testclient import TestClient

from backend.app.main import app, create_application
from backend.app.core.config import settings


def test_app_startup():
    """Verify application boots and root endpoint responds with metadata."""
    test_app = create_application()
    client = TestClient(test_app)
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == settings.APP_NAME
    assert data["version"] == settings.APP_VERSION
    assert "environment" in data


def test_health_endpoint_healthy(client):
    """Verify /api/v1/health returns 200 and 'connected' when database is accessible."""
    with patch("backend.app.api.v1.health.check_db_connection", return_value=(True, None)):
        response = client.get("/api/v1/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["database"] == "connected"
        assert data["version"] == settings.APP_VERSION
        assert data["database_error"] is None
        assert "timestamp" in data


def test_health_endpoint_db_failure(client):
    """Verify /api/v1/health returns 503 and 'disconnected' when database is unreachable."""
    with patch(
        "backend.app.api.v1.health.check_db_connection",
        return_value=(False, "Connection to server at 'localhost':5432 failed: Connection refused"),
    ):
        response = client.get("/api/v1/health")
        assert response.status_code == 503
        data = response.json()
        assert data["status"] == "degraded"
        assert data["database"] == "disconnected"
        assert data["database_error"] is not None
        assert "timestamp" in data

