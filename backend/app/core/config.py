"""Application Configuration Module.

Uses Pydantic Settings to load and validate environment variables.
"""

from typing import Annotated, Any, Literal
from pathlib import Path
from pydantic import AnyHttpUrl, BeforeValidator, Field, computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict


def parse_debug(v: Any) -> bool:
    """Parse debug flag leniently."""
    if isinstance(v, bool):
        return v
    if isinstance(v, str):
        return v.strip().lower() in {"1", "true", "yes", "on", "debug"}
    return bool(v)


def parse_cors_origins(v: Any) -> list[str]:
    """Parse CORS origins from a comma-separated string or a list."""
    if isinstance(v, str):
        return [origin.strip() for origin in v.split(",") if origin.strip()]
    if isinstance(v, (list, tuple)):
        return [str(origin).strip() for origin in v if str(origin).strip()]
    return ["http://localhost:3000", "http://localhost:5173", "http://127.0.0.1:5173"]


class Settings(BaseSettings):
    """Application settings with environment variable loading."""

    model_config = SettingsConfigDict(
        env_file=(".env", "../.env", "../../.env"),
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    # Application Information
    APP_NAME: str = "E-KYC Verification Platform"
    APP_VERSION: str = "1.0.0"
    APP_ENV: Literal["development", "staging", "production", "testing"] = "development"
    DEBUG: Annotated[bool, BeforeValidator(parse_debug)] = False
    API_V1_STR: str = "/api/v1"

    # PostgreSQL Database Configuration
    DATABASE_URL: str = Field(
        default="postgresql://postgres:postgres@localhost:5432/ekyc_db",
        description="SQLAlchemy database connection URL",
    )
    DB_POOL_SIZE: int = 10
    DB_MAX_OVERFLOW: int = 20
    DB_POOL_PRE_PING: bool = True
    DB_POOL_RECYCLE: int = 1800  # Recycle connections after 30 minutes

    # Security & Authentication
    JWT_SECRET_KEY: str = Field(
        default="dev-insecure-secret-key-change-in-production-min-32-bytes-needed",
        description="Secret key for signing JWT tokens",
    )
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    PASSWORD_RESET_EXPIRE_MINUTES: int = 15

    # Administrator Provisioning (from .env)
    ADMIN_EMAIL: str = "admin@ekyc-platform.com"
    ADMIN_PASSWORD: str = "Admin@Secure2026!"
    ADMIN_FULL_NAME: str = "System Administrator"

    # API Documentation (Swagger / ReDoc)
    ENABLE_DOCS: bool = True

    # CORS Configuration
    CORS_ORIGINS: Annotated[list[str] | str, BeforeValidator(parse_cors_origins)] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8501",
    ]

    # Face Verification & Biometrics
    FACE_SIMILARITY_THRESHOLD: float = 0.40  # Cosine distance <= 0.40 is considered a match
    TEMP_FACE_DIR: str = "data/temp_faces"

    @computed_field
    @property
    def is_sqlite(self) -> bool:
        """Helper to determine if the configured database is SQLite."""
        return self.DATABASE_URL.startswith("sqlite")


# Global cached settings instance
settings = Settings()
