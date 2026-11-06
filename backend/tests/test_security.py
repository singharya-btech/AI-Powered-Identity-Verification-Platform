"""Tests for security utilities: bcrypt password hashing and JWT management."""

import pytest
from datetime import timedelta
import jwt

from backend.app.core.security import (
    create_access_token,
    decode_access_token,
    get_password_hash,
    verify_password,
)
from backend.app.core.config import parse_cors_origins


def test_password_hashing_and_verification():
    """Verify bcrypt hash generation and validation."""
    password = "MyComplexPassword#2026"
    hashed = get_password_hash(password)

    assert hashed != password
    assert hashed.startswith("$2b$")
    assert verify_password(password, hashed) is True
    assert verify_password("WrongPassword!", hashed) is False


def test_jwt_token_generation_and_decoding():
    """Verify JWT access token creation and decoding."""
    subject = "user-uuid-12345"
    token = create_access_token(subject=subject, extra_claims={"role": "ADMIN"})

    payload = decode_access_token(token)
    assert payload["sub"] == subject
    assert payload["role"] == "ADMIN"
    assert payload["type"] == "access"
    assert "exp" in payload
    assert "iat" in payload


def test_jwt_token_expiration():
    """Verify expired JWT tokens raise ExpiredSignatureError."""
    subject = "user-uuid-12345"
    expired_token = create_access_token(subject=subject, expires_delta=timedelta(seconds=-10))

    with pytest.raises(jwt.ExpiredSignatureError):
        decode_access_token(expired_token)


def test_jwt_invalid_token():
    """Verify forged or malformed tokens raise PyJWTError."""
    with pytest.raises(jwt.PyJWTError):
        decode_access_token("not-a-valid-jwt-token")


def test_cors_origins_parsing():
    """Verify parse_cors_origins handles comma-separated strings and lists."""
    raw_str = "http://localhost:3000, https://app.example.com"
    parsed = parse_cors_origins(raw_str)
    assert parsed == ["http://localhost:3000", "https://app.example.com"]

    raw_list = ["http://localhost:5173", "http://127.0.0.1:5173"]
    assert parse_cors_origins(raw_list) == raw_list

