"""API v1 router aggregator."""

from fastapi import APIRouter
from backend.app.api.v1 import auth, health, kyc

api_v1_router = APIRouter()
api_v1_router.include_router(health.router)
api_v1_router.include_router(auth.router)
api_v1_router.include_router(kyc.router)
