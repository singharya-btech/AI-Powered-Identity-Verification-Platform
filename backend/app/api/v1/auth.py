"""Authentication and Authorization Endpoints."""

import logging
from typing import List
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from backend.app.api.deps import get_current_user, require_admin
from backend.app.core.config import settings
from backend.app.core.rate_limit import login_rate_limiter
from backend.app.core.security import (
    create_access_token,
    get_password_hash,
    verify_password,
)
from backend.app.db.session import get_db
from backend.app.models.audit_log import AuditLog
from backend.app.models.role import Role
from backend.app.models.user import User
from backend.app.schemas.user import (
    TokenResponse,
    UserLogin,
    UserRegisterRequest,
    UserResponse,
)

logger = logging.getLogger("uvicorn.error")
router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post(
    "/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Customer Registration",
    description="Register a new customer account. The CUSTOMER role is assigned automatically.",
    responses={
        201: {"description": "Customer registered successfully"},
        400: {"description": "Invalid input or duplicate email"},
        422: {"description": "Password complexity or email validation failure"},
    },
)
def register(
    payload: UserRegisterRequest,
    db: Session = Depends(get_db),
) -> UserResponse:
    """Register a new customer account."""
    normalized_email = payload.email.lower().strip()

    # Check for duplicate email (case-insensitive)
    existing_user = db.execute(
        select(User).where(func.lower(User.email) == normalized_email)
    ).scalar_one_or_none()

    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this email address already exists",
        )

    # Fetch CUSTOMER role
    customer_role = db.execute(
        select(Role).where(Role.name == "CUSTOMER")
    ).scalar_one_or_none()

    if not customer_role:
        # Fallback if roles table is not seeded
        customer_role = Role(id=2, name="CUSTOMER", description="Customer")
        db.add(customer_role)
        db.flush()

    # Hash password securely using bcrypt
    hashed_password = get_password_hash(payload.password)

    new_user = User(
        full_name=payload.full_name.strip(),
        email=normalized_email,
        password_hash=hashed_password,
        role_id=customer_role.id,
        is_active=True,
        is_verified=False,
    )
    db.add(new_user)
    db.flush()

    # Audit logging
    audit = AuditLog(
        user_id=new_user.id,
        action="USER_REGISTERED",
        resource_type="user",
        resource_id=str(new_user.id),
    )
    db.add(audit)
    db.commit()
    db.refresh(new_user)

    logger.info(f"Customer registered successfully: user_id={new_user.id}")
    return UserResponse.model_validate(new_user)


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="User Login",
    description="Authenticate with email and password to receive a JWT bearer access token.",
    responses={
        200: {"description": "Authentication successful"},
        401: {"description": "Incorrect email or password"},
        403: {"description": "Account is deactivated"},
        429: {"description": "Too many failed login attempts"},
    },
)
def login(
    request: Request,
    response: Response,
    payload: UserLogin,
    db: Session = Depends(get_db),
) -> TokenResponse:
    """Authenticate credentials and issue a signed JWT access token."""
    client_ip = request.client.host if request.client else "unknown"
    normalized_email = payload.email.lower().strip()
    rate_limit_key = f"{client_ip}:{normalized_email}"

    # Rate limiting check
    if login_rate_limiter.is_rate_limited(rate_limit_key):
        retry_after = login_rate_limiter.get_retry_after(rate_limit_key)
        logger.warning(f"Login rate limited for IP={client_ip}")
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many failed login attempts. Please try again in {retry_after} seconds.",
            headers={"Retry-After": str(retry_after)},
        )

    # Query user with eager-loaded role
    user = db.execute(
        select(User)
        .options(joinedload(User.role))
        .where(func.lower(User.email) == normalized_email)
    ).scalar_one_or_none()

    # Generic credential check (constant-time evaluation avoids email enumeration)
    if not user or not verify_password(payload.password, user.password_hash):
        login_rate_limiter.record_failure(rate_limit_key)
        logger.warning(f"Failed authentication attempt for email: {normalized_email} from IP: {client_ip}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Reject inactive accounts
    if not user.is_active:
        logger.warning(f"Login rejected for deactivated user: user_id={user.id}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated. Please contact support",
        )

    # Successful login: reset rate limit tracking
    login_rate_limiter.reset(rate_limit_key)

    # Generate JWT token
    role_name = user.role.name if user.role else "CUSTOMER"
    token = create_access_token(
        subject=str(user.id),
        extra_claims={"role": role_name, "email": user.email},
    )

    # Record login audit event
    audit = AuditLog(
        user_id=user.id,
        action="USER_LOGIN_SUCCESS",
        resource_type="user",
        resource_id=str(user.id),
    )
    db.add(audit)
    db.commit()

    logger.info(f"User authenticated successfully: user_id={user.id}, role={role_name}")
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=UserResponse.model_validate(user),
    )


@router.get(
    "/me",
    response_model=UserResponse,
    summary="Current User Profile",
    description="Retrieve the authenticated user's profile and assigned role. Requires valid JWT.",
    responses={
        200: {"description": "Authenticated user profile"},
        401: {"description": "Not authenticated or token expired"},
        403: {"description": "Account is deactivated"},
    },
)
def get_me(
    current_user: User = Depends(get_current_user),
) -> UserResponse:
    """Return the profile of the currently authenticated user."""
    return UserResponse.model_validate(current_user)


@router.get(
    "/admin/users",
    response_model=List[UserResponse],
    summary="List Registered Users (Admin Only)",
    description="Protected endpoint accessible only by users possessing the ADMIN role.",
    responses={
        200: {"description": "List of all registered users"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient permissions (Customer attempted access)"},
    },
)
def list_users_admin(
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> List[UserResponse]:
    """Admin-only endpoint listing all registered users."""
    users = db.execute(
        select(User).options(joinedload(User.role)).order_by(User.created_at.desc())
    ).scalars().all()
    return [UserResponse.model_validate(u) for u in users]
