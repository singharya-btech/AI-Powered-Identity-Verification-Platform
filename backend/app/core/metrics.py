"""Prometheus Metrics Instrumentation for E-KYC Platform.

Provides Prometheus metrics covering HTTP traffic, error rates, and KYC/AI domain
operations (document OCR, FaceNet biometric verification, workflow state metrics).
Strictly adheres to data minimization: zero customer PII, zero document numbers,
zero biometric embeddings, and low-cardinality endpoint normalization.
"""

import re
import time
from typing import Callable
from fastapi import FastAPI, Request, Response
from fastapi.responses import Response as RawResponse
from prometheus_client import (
    CONTENT_TYPE_LATEST,
    Counter,
    Gauge,
    Histogram,
    REGISTRY,
    generate_latest,
)

# ==============================================================================
# 1. Prometheus Metric Declarations
# ==============================================================================

# HTTP Request Metrics
HTTP_REQUESTS_TOTAL = Counter(
    "http_requests_total",
    "Total number of HTTP requests processed.",
    ["method", "endpoint", "status_code"],
)

HTTP_REQUEST_DURATION_SECONDS = Histogram(
    "http_request_duration_seconds",
    "HTTP request latency in seconds.",
    ["method", "endpoint"],
    buckets=(0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0, 30.0, 60.0),
)

HTTP_ACTIVE_REQUESTS = Gauge(
    "http_active_requests",
    "Number of active HTTP requests currently being processed.",
    ["method"],
)

APPLICATION_ERRORS_TOTAL = Counter(
    "application_errors_total",
    "Total count of application exceptions and errors.",
    ["error_type", "endpoint"],
)

# KYC Domain & AI Processing Metrics
KYC_DOCUMENT_UPLOADS_TOTAL = Counter(
    "kyc_document_uploads_total",
    "Total number of identity document uploads processed.",
    ["document_type", "status"],
)

KYC_OCR_DURATION_SECONDS = Histogram(
    "kyc_ocr_duration_seconds",
    "Latency of EasyOCR text detection and parsing in seconds.",
    ["document_type"],
    buckets=(0.1, 0.25, 0.5, 1.0, 2.0, 5.0, 10.0, 20.0, 45.0),
)

KYC_FACE_VERIFICATIONS_TOTAL = Counter(
    "kyc_face_verifications_total",
    "Total number of FaceNet biometric similarity comparisons performed.",
    ["result"],  # "match", "mismatch", "no_face", "multiple_faces", "error"
)

KYC_FACE_VERIFICATION_DURATION_SECONDS = Histogram(
    "kyc_face_verification_duration_seconds",
    "Latency of DeepFace FaceNet 512D biometric embedding comparison in seconds.",
    buckets=(0.1, 0.25, 0.5, 1.0, 2.0, 5.0, 10.0, 20.0, 45.0),
)

KYC_WORKFLOW_STATUS_COUNT = Gauge(
    "kyc_workflow_status_count",
    "Total number of KYC sessions categorized by current workflow status.",
    ["status"],
)

# ==============================================================================
# 2. Path Normalization (High-Cardinality Prevention)
# ==============================================================================
UUID_REGEX = re.compile(
    r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
)
NUMERIC_ID_REGEX = re.compile(r"/\d+(?=/|$)")


def normalize_endpoint(path: str) -> str:
    """Normalize raw URL paths to static templates to prevent high label cardinality.

    Examples:
        /api/v1/kyc/sessions/550e8400-e29b-41d4-a716-446655440000/review
        -> /api/v1/kyc/sessions/{session_id}/review
    """
    normalized = UUID_REGEX.sub("{session_id}", path)
    normalized = NUMERIC_ID_REGEX.sub("/{id}", normalized)
    return normalized


# ==============================================================================
# 3. Middleware & App Instrumentation
# ==============================================================================
class PrometheusMiddleware:
    """ASGI Middleware to capture request counts, durations, and active gauges."""

    def __init__(self, app: FastAPI):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        method = scope.get("method", "UNKNOWN")
        path = scope.get("path", "/")

        # Skip metrics endpoint itself to avoid self-monitoring loop
        if path == "/metrics":
            await self.app(scope, receive, send)
            return

        endpoint = normalize_endpoint(path)
        HTTP_ACTIVE_REQUESTS.labels(method=method).inc()
        start_time = time.perf_counter()

        status_code = 500

        async def send_wrapper(message):
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message.get("status", 500)
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        except Exception as exc:
            APPLICATION_ERRORS_TOTAL.labels(
                error_type=exc.__class__.__name__, endpoint=endpoint
            ).inc()
            raise
        finally:
            duration = time.perf_counter() - start_time
            HTTP_ACTIVE_REQUESTS.labels(method=method).dec()
            HTTP_REQUESTS_TOTAL.labels(
                method=method, endpoint=endpoint, status_code=str(status_code)
            ).inc()
            HTTP_REQUEST_DURATION_SECONDS.labels(
                method=method, endpoint=endpoint
            ).observe(duration)


def setup_metrics(app: FastAPI) -> None:
    """Mount Prometheus middleware and /metrics scraping endpoint onto FastAPI app."""
    # Add ASGI middleware
    app.add_middleware(PrometheusMiddleware)

    # Expose Prometheus /metrics endpoint
    @app.get("/metrics", include_in_schema=False, tags=["Monitoring"])
    def metrics() -> Response:
        """Expose Prometheus formatted application telemetry."""
        return RawResponse(generate_latest(REGISTRY), media_type=CONTENT_TYPE_LATEST)

