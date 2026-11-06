"""Tests for SQLAlchemy database models and their relational constraints."""

import uuid
import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from backend.app.models import AuditLog, KycSession, Role, User
from backend.app.core.security import get_password_hash


def test_user_creation_and_role_relationship(db_session):
    """Verify creating a user and navigating its foreign key role relationship."""
    customer_role = db_session.execute(select(Role).where(Role.name == "CUSTOMER")).scalar_one()

    user = User(
        full_name="Aarav Sharma",
        email="aarav.sharma@example.com",
        password_hash=get_password_hash("SecurePassword123!"),
        role_id=customer_role.id,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    assert isinstance(user.id, uuid.UUID)
    assert user.full_name == "Aarav Sharma"
    assert user.is_active is True
    assert user.is_verified is False
    assert user.role.name == "CUSTOMER"
    assert user in customer_role.users


def test_user_unique_email_constraint(db_session):
    """Verify duplicate emails raise an IntegrityError."""
    customer_role = db_session.execute(select(Role).where(Role.name == "CUSTOMER")).scalar_one()

    user1 = User(
        full_name="User One",
        email="duplicate@example.com",
        password_hash="hash1",
        role_id=customer_role.id,
    )
    db_session.add(user1)
    db_session.commit()

    user2 = User(
        full_name="User Two",
        email="duplicate@example.com",
        password_hash="hash2",
        role_id=customer_role.id,
    )
    db_session.add(user2)
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_kyc_session_relationship_and_cascade(db_session):
    """Verify user to KYC session relationship and cascade on user deletion."""
    customer_role = db_session.execute(select(Role).where(Role.name == "CUSTOMER")).scalar_one()

    user = User(
        full_name="Priya Patel",
        email="priya@example.com",
        password_hash="hash",
        role_id=customer_role.id,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    kyc_session = KycSession(
        user_id=user.id,
        document_type="PAN",
        status="PENDING",
    )
    db_session.add(kyc_session)
    db_session.commit()
    db_session.refresh(kyc_session)

    assert kyc_session.user.id == user.id
    assert len(user.kyc_sessions) == 1
    assert user.kyc_sessions[0].document_type == "PAN"

    # Cascade deletion check: deleting user deletes KYC session
    db_session.delete(user)
    db_session.commit()

    found_session = db_session.execute(
        select(KycSession).where(KycSession.id == kyc_session.id)
    ).scalar_one_or_none()
    assert found_session is None


def test_audit_log_relationship(db_session):
    """Verify audit log entries record events and preserve logs on user deletion."""
    customer_role = db_session.execute(select(Role).where(Role.name == "CUSTOMER")).scalar_one()

    user = User(
        full_name="Rahul Verma",
        email="rahul@example.com",
        password_hash="hash",
        role_id=customer_role.id,
    )
    db_session.add(user)
    db_session.commit()

    log_entry = AuditLog(
        user_id=user.id,
        action="USER_LOGIN",
        resource_type="user",
        resource_id=str(user.id),
    )
    db_session.add(log_entry)
    db_session.commit()
    db_session.refresh(log_entry)

    assert log_entry.action == "USER_LOGIN"
    assert log_entry.user.email == "rahul@example.com"

    # User deletion sets user_id to NULL rather than deleting the audit trail
    db_session.delete(user)
    db_session.commit()
    db_session.refresh(log_entry)

    assert log_entry.user_id is None
    assert log_entry.action == "USER_LOGIN"


def test_models_do_not_store_raw_pii_or_embeddings():
    """Verify model columns do not contain sensitive PII or raw biometric fields."""
    forbidden_terms = {"aadhaar_number", "pan_number", "face_embedding", "embedding", "raw_image", "id_image"}
    for model in (User, Role, KycSession, AuditLog):
        column_names = {c.name.lower() for c in model.__table__.columns}
        intersection = column_names.intersection(forbidden_terms)
        assert len(intersection) == 0, f"Model {model.__name__} contains forbidden PII columns: {intersection}"

