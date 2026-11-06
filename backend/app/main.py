"""FastAPI Application Entry Point."""

import logging
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.exceptions import RequestValidationError
from fastapi.encoders import jsonable_encoder

from backend.app.core.config import settings
from backend.app.core.metrics import setup_metrics
from backend.app.api.v1.router import api_v1_router
from backend.app.api.v1.health import get_health, HealthResponse
from backend.app.db.session import check_db_connection

logger = logging.getLogger("uvicorn.error")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager."""
    # Startup: Check database connectivity on boot (skip in test environment)
    if settings.APP_ENV != "testing" and os.getenv("APP_ENV") != "testing":
        db_ok, db_err = check_db_connection()
        if db_ok:
            logger.info("Database connection established successfully.")
            # Automatically provision or synchronize administrator from .env
            try:
                from backend.scripts.create_admin import provision_admin
                ok, msg = provision_admin(
                    email=settings.ADMIN_EMAIL,
                    password=settings.ADMIN_PASSWORD,
                    full_name=settings.ADMIN_FULL_NAME,
                )
                logger.info(f"Admin provisioning on boot: {msg}")
            except Exception as exc:
                logger.warning(f"Could not provision admin on boot: {exc}")
        else:
            logger.warning(f"Database connection check failed on startup: {db_err}")

    yield

    # Shutdown logic if needed
    logger.info("Application shutting down.")


def create_application() -> FastAPI:
    """Application factory for FastAPI."""
    is_test = os.getenv("APP_ENV") == "testing" or settings.APP_ENV == "testing"
    app = FastAPI(
        title=settings.APP_NAME,
        version=settings.APP_VERSION,
        description="AI-powered E-KYC Identity Verification Platform API",
        docs_url="/docs" if settings.ENABLE_DOCS else None,
        redoc_url="/redoc" if settings.ENABLE_DOCS else None,
        openapi_url="/openapi.json" if settings.ENABLE_DOCS else None,
        lifespan=None if is_test else lifespan,
    )

    # CORS Middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["*"],
    )

    # Global Exception Handlers
    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={
                "detail": jsonable_encoder(exc.errors()),
                "error": "Validation Error",
            },
        )

    @app.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException):
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "detail": exc.detail,
                "error": exc.detail,
                "status_code": exc.status_code,
            },
            headers=exc.headers,
        )

    @app.exception_handler(Exception)
    async def generic_exception_handler(request: Request, exc: Exception):
        logger.error(f"Unhandled exception on {request.method} {request.url.path}: {exc}", exc_info=True)
        message = "An unexpected internal server error occurred."
        if settings.APP_ENV == "development" or settings.DEBUG:
            message = str(exc)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "error": "Internal Server Error",
                "detail": message,
            },
        )

    # Root endpoint
    @app.get("/", tags=["Root"])
    def root():
        return {
            "name": settings.APP_NAME,
            "version": settings.APP_VERSION,
            "environment": settings.APP_ENV,
            "docs": "/docs" if settings.ENABLE_DOCS else "Disabled",
            "api_v1_docs": f"{settings.API_V1_STR}/docs" if settings.ENABLE_DOCS else "Disabled",
            "health": "/health",
            "metrics": "/metrics",
        }

    # API documentation aliases and redirects
    if settings.ENABLE_DOCS:
        @app.get(f"{settings.API_V1_STR}/docs", include_in_schema=False)
        def redirect_v1_docs():
            return RedirectResponse(url="/docs")

        @app.get(f"{settings.API_V1_STR}/openapi.json", include_in_schema=False)
        def redirect_v1_openapi():
            return RedirectResponse(url="/openapi.json")

        @app.get(f"{settings.API_V1_STR}/redoc", include_in_schema=False)
        def redirect_v1_redoc():
            return RedirectResponse(url="/redoc")

    # Root healthcheck alias
    @app.get("/health", response_model=HealthResponse, tags=["Health"], include_in_schema=False)
    def root_health(response: Response):
        return get_health(response)

    # Mount API v1 router
    app.include_router(api_v1_router, prefix=settings.API_V1_STR)

    # Mount Prometheus metrics instrumentation and /metrics endpoint
    setup_metrics(app)

    return app


app = create_application()

