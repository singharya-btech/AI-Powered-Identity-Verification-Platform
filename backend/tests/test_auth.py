"""Automated test suite for Authentication and Role-Based Access Control (RBAC)."""

import uuid
from datetime import timedelta
import pytest
from sqlalchemy import select

from backend.app.core.rate_limit import login_rate_limiter
from backend.app.core.security import (
    create_access_token,
    get_password_hash,
    verify_password,
)
from backend.app.models.role import Role
from backend.app.models.user import User
from backend.scripts.create_admin import provision_admin


@pytest.fixture(autouse=True)
def reset_rate_limiter():
    """Reset in-memory login rate limiter before and after each test."""
    login_rate_limiter._attempts.clear()
    yield
    login_rate_limiter._attempts.clear()


# ==============================================================================
# 1. Registration Tests
# ==============================================================================

def test_register_customer_success(client, db_session):
    """Test 1: Successful customer registration assigns CUSTOMER role automatically."""
    payload = {
        "full_name": "Aarav Sharma",
        "email": "aarav.sharma@example.com",
        "password": "SecurePassword#2026",
    }
    response = client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 201

    data = response.json()
    assert data["email"] == "aarav.sharma@example.com"
    assert data["full_name"] == "Aarav Sharma"
    assert data["is_active"] is True
    assert data["is_verified"] is False
    assert "password_hash" not in data
    assert data["role"]["name"] == "CUSTOMER"

    # Verify database state
    user_in_db = db_session.execute(
        select(User).where(User.email == "aarav.sharma@example.com")
    ).scalar_one_or_none()
    assert user_in_db is not None
    assert user_in_db.role.name == "CUSTOMER"


def test_register_duplicate_email_rejected(client):
    """Test 2: Reject registration with duplicate email address (case-insensitive)."""
    payload = {
        "full_name": "First User",
        "email": "unique@example.com",
        "password": "Password#1234",
    }
    first_resp = client.post("/api/v1/auth/register", json=payload)
    assert first_resp.status_code == 201

    # Attempt to register again with different case
    duplicate_payload = {
        "full_name": "Second User",
        "email": "UNIQUE@EXAMPLE.COM",
        "password": "Password#5678",
    }
    dup_resp = client.post("/api/v1/auth/register", json=duplicate_payload)
    assert dup_resp.status_code == 400
    assert "already exists" in dup_resp.json()["detail"]


def test_register_password_is_hashed(client, db_session):
    """Test 3: Passwords stored in the database are hashed using bcrypt."""
    plain_password = "MyStrongPassword#99"
    payload = {
        "full_name": "Hashed User",
        "email": "hashed@example.com",
        "password": plain_password,
    }
    response = client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 201

    user_in_db = db_session.execute(
        select(User).where(User.email == "hashed@example.com")
    ).scalar_one()
    assert user_in_db.password_hash != plain_password
    assert user_in_db.password_hash.startswith("$2b$")
    assert verify_password(plain_password, user_in_db.password_hash) is True


def test_register_weak_password_rejected(client):
    """Test: Reject weak passwords failing complexity requirements."""
    weak_passwords = [
        ("short1!", "at least 8 characters"),
        ("nouppercase123!", "uppercase letter"),
        ("NOLOWERCASE123!", "lowercase letter"),
        ("NoDigitsHere!!", "at least one digit"),
        ("NoSpecialChar123", "special character"),
    ]
    for weak_pw, expected_err in weak_passwords:
        payload = {
            "full_name": "Weak Password User",
            "email": f"weak_{hash(weak_pw)}@example.com",
            "password": weak_pw,
        }
        response = client.post("/api/v1/auth/register", json=payload)
        assert response.status_code == 422


def test_customer_cannot_assign_themselves_admin(client, db_session):
    """Test 12: Customer registration strictly rejects/ignores role injection."""
    payload = {
        "full_name": "Attacker",
        "email": "attacker@example.com",
        "password": "AttackerPassword#123",
        "role_id": 1,
        "role": "ADMIN",
    }
    response = client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 201

    # Database must still have assigned CUSTOMER role
    user_in_db = db_session.execute(
        select(User).where(User.email == "attacker@example.com")
    ).scalar_one()
    assert user_in_db.role.name == "CUSTOMER"
    assert user_in_db.role_id == 2


# ==============================================================================
# 2. Login Tests
# ==============================================================================

def test_login_success(client):
    """Test 4: Successful login returns JWT access token with role claims."""
    reg_payload = {
        "full_name": "Login User",
        "email": "login@example.com",
        "password": "LoginPassword#2026",
    }
    client.post("/api/v1/auth/register", json=reg_payload)

    login_payload = {
        "email": "LOGIN@EXAMPLE.COM",  # Case-insensitive
        "password": "LoginPassword#2026",
    }
    response = client.post("/api/v1/auth/login", json=login_payload)
    assert response.status_code == 200

    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert data["expires_in"] > 0
    assert data["user"]["email"] == "login@example.com"
    assert data["user"]["role"]["name"] == "CUSTOMER"


def test_login_invalid_password_returns_generic_error(client):
    """Test 5: Wrong password returns generic 401 message."""
    reg_payload = {
        "full_name": "User",
        "email": "wrongpass@example.com",
        "password": "CorrectPassword#1",
    }
    client.post("/api/v1/auth/register", json=reg_payload)

    response = client.post(
        "/api/v1/auth/login",
        json={"email": "wrongpass@example.com", "password": "WrongPassword#999"},
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "Incorrect email or password"


def test_login_nonexistent_email_returns_generic_error(client):
    """Test 6: Non-existent email returns same generic 401 message without enumeration."""
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "does_not_exist@example.com", "password": "SomePassword#1"},
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "Incorrect email or password"


def test_login_inactive_account_rejected(client, db_session):
    """Test 7: Inactive user login is rejected with HTTP 403."""
    reg_payload = {
        "full_name": "Inactive User",
        "email": "inactive@example.com",
        "password": "ValidPassword#123",
    }
    client.post("/api/v1/auth/register", json=reg_payload)

    # Deactivate user
    user = db_session.execute(
        select(User).where(User.email == "inactive@example.com")
    ).scalar_one()
    user.is_active = False
    db_session.commit()

    response = client.post(
        "/api/v1/auth/login",
        json={"email": "inactive@example.com", "password": "ValidPassword#123"},
    )
    assert response.status_code == 403
    assert "deactivated" in response.json()["detail"].lower()


def test_login_rate_limiting(client):
    """Test: Repeated failed login attempts trigger HTTP 429 rate limiting."""
    login_payload = {"email": "ratelimit@example.com", "password": "WrongPassword#1"}
    for _ in range(5):
        resp = client.post("/api/v1/auth/login", json=login_payload)
        assert resp.status_code == 401

    # 6th attempt should be blocked by rate limiter
    blocked_resp = client.post("/api/v1/auth/login", json=login_payload)
    assert blocked_resp.status_code == 429
    assert "Too many failed login attempts" in blocked_resp.json()["detail"]
    assert "Retry-After" in blocked_resp.headers


# ==============================================================================
# 3. JWT and Authentication Dependency Tests
# ==============================================================================

def test_auth_me_success_with_valid_jwt(client):
    """Test 8 & 10: Valid JWT allows fetching current user profile."""
    reg_payload = {
        "full_name": "Profile User",
        "email": "profile@example.com",
        "password": "ProfilePassword#1",
    }
    client.post("/api/v1/auth/register", json=reg_payload)

    login_resp = client.post(
        "/api/v1/auth/login",
        json={"email": "profile@example.com", "password": "ProfilePassword#1"},
    )
    token = login_resp.json()["access_token"]

    response = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == "profile@example.com"
    assert data["full_name"] == "Profile User"
    assert data["role"]["name"] == "CUSTOMER"
    assert "password_hash" not in data


def test_auth_me_missing_token_rejected(client):
    """Test 14: Requests without authorization header return HTTP 401."""
    response = client.get("/api/v1/auth/me")
    assert response.status_code == 401
    assert "credentials were not provided" in response.json()["detail"]


def test_auth_me_invalid_token_rejected(client):
    """Test 9: Invalid / forged token signature returns HTTP 401."""
    response = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": "Bearer invalid.token.value"},
    )
    assert response.status_code == 401
    assert "Invalid authentication token" in response.json()["detail"]


def test_auth_me_expired_token_rejected(client, db_session):
    """Test 8: Expired JWT access token returns HTTP 401."""
    customer_role = db_session.execute(select(Role).where(Role.name == "CUSTOMER")).scalar_one()
    user = User(
        full_name="Expired User",
        email="expired@example.com",
        password_hash="hash",
        role_id=customer_role.id,
    )
    db_session.add(user)
    db_session.commit()

    # Create expired token (-1 minute)
    expired_token = create_access_token(
        subject=str(user.id),
        expires_delta=timedelta(minutes=-1),
    )

    response = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {expired_token}"},
    )
    assert response.status_code == 401
    assert "expired" in response.json()["detail"].lower()


def test_auth_me_inactive_user_token_rejected(client, db_session):
    """Test: Valid token belonging to an inactive user returns HTTP 403."""
    customer_role = db_session.execute(select(Role).where(Role.name == "CUSTOMER")).scalar_one()
    user = User(
        full_name="Inactive Token User",
        email="inactivetoken@example.com",
        password_hash="hash",
        role_id=customer_role.id,
        is_active=False,
    )
    db_session.add(user)
    db_session.commit()

    token = create_access_token(subject=str(user.id))

    response = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 403
    assert "deactivated" in response.json()["detail"].lower()


# ==============================================================================
# 4. Role-Based Access Control (RBAC) Tests
# ==============================================================================

def test_customer_cannot_access_admin_endpoint(client):
    """Test 11: Users with CUSTOMER role receive HTTP 403 on admin-only endpoints."""
    reg_payload = {
        "full_name": "Standard Customer",
        "email": "customer@example.com",
        "password": "CustomerPassword#1",
    }
    client.post("/api/v1/auth/register", json=reg_payload)

    login_resp = client.post(
        "/api/v1/auth/login",
        json={"email": "customer@example.com", "password": "CustomerPassword#1"},
    )
    customer_token = login_resp.json()["access_token"]

    admin_resp = client.get(
        "/api/v1/auth/admin/users",
        headers={"Authorization": f"Bearer {customer_token}"},
    )
    assert admin_resp.status_code == 403
    assert "Administrator access required" in admin_resp.json()["detail"]


def test_admin_can_access_admin_endpoint(client, db_session):
    """Test 13: Users with ADMIN role successfully access admin-only endpoints."""
    admin_role = db_session.execute(select(Role).where(Role.name == "ADMIN")).scalar_one()
    admin_user = User(
        full_name="Platform Admin",
        email="admin.user@example.com",
        password_hash=get_password_hash("AdminPass#2026"),
        role_id=admin_role.id,
        is_active=True,
        is_verified=True,
    )
    db_session.add(admin_user)
    db_session.commit()

    login_resp = client.post(
        "/api/v1/auth/login",
        json={"email": "admin.user@example.com", "password": "AdminPass#2026"},
    )
    admin_token = login_resp.json()["access_token"]

    response = client.get(
        "/api/v1/auth/admin/users",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 200
    users_list = response.json()
    assert isinstance(users_list, list)
    assert any(u["email"] == "admin.user@example.com" for u in users_list)


# ==============================================================================
# 5. Administrator Provisioning Script Tests
# ==============================================================================

def test_admin_provisioning_script(db_session):
    """Test 15: Admin provisioning script creates admin account and prevents duplicates."""
    admin_email = "root.admin@example.com"
    admin_password = "SuperSecretAdminPassword#2026"

    # Initial creation
    success, message = provision_admin(
        email=admin_email,
        password=admin_password,
        full_name="Root Admin",
        session=db_session,
    )
    assert success is True
    assert "successfully provisioned" in message

    # Verify user exists with ADMIN role
    created_admin = db_session.execute(
        select(User).where(User.email == admin_email)
    ).scalar_one()
    assert created_admin.role.name == "ADMIN"
    assert created_admin.is_active is True
    assert verify_password(admin_password, created_admin.password_hash) is True

    # Idempotent re-run does not error or duplicate
    success2, message2 = provision_admin(
        email=admin_email,
        password=admin_password,
        full_name="Root Admin",
        session=db_session,
    )
    assert success2 is True
    assert "already exists" in message2

