"""Pydantic schemas for User and Authentication."""

import uuid
from datetime import datetime
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from backend.app.core.security import validate_password_strength


class RoleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: str | None = None


class UserBase(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=255)


class UserRegisterRequest(BaseModel):
    """Customer registration request schema.

    Strictly omits role selection to prevent privilege escalation.
    """
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=255)
    password: str = Field(min_length=8, max_length=128)

    @field_validator("password")
    @classmethod
    def check_password_complexity(cls, v: str) -> str:
        return validate_password_strength(v)


class UserCreate(UserBase):
    """Internal user creation schema used by administration tools."""
    password: str = Field(min_length=8, max_length=128)
    role_id: int = 2  # Default to CUSTOMER

    @field_validator("password")
    @classmethod
    def check_password_complexity(cls, v: str) -> str:
        return validate_password_strength(v)


class UserLogin(BaseModel):
    """User login credential schema."""
    email: EmailStr
    password: str = Field(min_length=1)


class UserUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=255)
    is_active: bool | None = None
    is_verified: bool | None = None


class UserResponse(UserBase):
    """Safe user profile response without password hashes."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    is_active: bool
    is_verified: bool
    role_id: int
    role: RoleResponse | None = None
    created_at: datetime
    updated_at: datetime


class TokenResponse(BaseModel):
    """JWT bearer token response."""
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserResponse | None = None
