"""Reusable FastAPI authentication and authorization dependencies."""

import uuid
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from backend.app.core.security import decode_access_token
from backend.app.db.session import get_db
from backend.app.models.user import User

# HTTPBearer security scheme for OpenAPI documentation
oauth2_scheme = HTTPBearer(
    auto_error=False,
    description="Enter the JWT access token in the format: Bearer <token>",
)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    """Validate JWT token, extract user ID, verify database record, and enforce active state.

    Raises:
        HTTPException: 401 Unauthorized for missing, malformed, or expired tokens.
        HTTPException: 403 Forbidden for deactivated accounts.
    """
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication credentials were not provided",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication scheme. Bearer token required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials
    try:
        payload = decode_access_token(token)
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id_str = payload.get("sub")
    if not user_id_str:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload: missing subject",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        user_uuid = uuid.UUID(str(user_id_str))
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user identifier format in token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Fetch fresh user and actual role from PostgreSQL (do not blindly trust token role claim)
    query = (
        select(User)
        .options(joinedload(User.role))
        .where(User.id == user_uuid)
    )
    user = db.execute(query).scalar_one_or_none()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User associated with token no longer exists",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is deactivated. Please contact support",
        )

    return user


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    """Enforce that the authenticated user possesses the ADMIN role in the database.

    Raises:
        HTTPException: 403 Forbidden if user is not an administrator.
    """
    if not current_user.role or current_user.role.name != "ADMIN":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions. Administrator access required",
        )
    return current_user


def require_customer(current_user: User = Depends(get_current_user)) -> User:
    """Enforce that the authenticated user possesses CUSTOMER or ADMIN privileges.

    Raises:
        HTTPException: 403 Forbidden if user lacks customer permissions.
    """
    if not current_user.role or current_user.role.name not in {"CUSTOMER", "ADMIN"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions. Customer access required",
        )
    return current_user

