"""Health check API endpoints."""

from datetime import datetime, timezone
from typing import Literal
from fastapi import APIRouter, Response, status
from pydantic import BaseModel

from backend.app.core.config import settings
from backend.app.db.session import check_db_connection

router = APIRouter(tags=["Health"])


class HealthResponse(BaseModel):
    status: Literal["healthy", "degraded"]
    database: Literal["connected", "disconnected"]
    version: str
    environment: str
    timestamp: datetime
    database_error: str | None = None


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Application and Database Health Check",
    description="Returns detailed health metrics distinguishing application availability from database connectivity.",
    responses={
        200: {"description": "System and database are healthy"},
        503: {"description": "Application is running but database is disconnected"},
    },
)
def get_health(response: Response) -> HealthResponse:
    """Perform health checks on application runtime and database connectivity."""
    db_connected, db_error = check_db_connection()
    now = datetime.now(timezone.utc)

    if not db_connected:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return HealthResponse(
            status="degraded",
            database="disconnected",
            version=settings.APP_VERSION,
            environment=settings.APP_ENV,
            timestamp=now,
            database_error=db_error if settings.APP_ENV != "production" else "Database unreachable",
        )

    response.status_code = status.HTTP_200_OK
    return HealthResponse(
        status="healthy",
        database="connected",
        version=settings.APP_VERSION,
        environment=settings.APP_ENV,
        timestamp=now,
        database_error=None,
    )

