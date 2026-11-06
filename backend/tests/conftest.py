"""Pytest fixtures for backend testing."""

import os
os.environ["APP_ENV"] = "testing"
os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["JWT_SECRET_KEY"] = "test-secret-key-for-testing-only-at-least-32-chars-long"

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient

from backend.app.core.config import settings
settings.APP_ENV = "testing"
from backend.app.db.base import Base
from backend.app.db.session import get_db
from backend.app.main import create_application
from backend.app.models import Role, User, KycSession, AuditLog

# Test database setup (isolated in-memory SQLite with StaticPool)
TEST_DATABASE_URL = "sqlite:///:memory:"

test_engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


@pytest.fixture(scope="session", autouse=True)
def setup_test_environment():
    """Configure environment for testing."""
    os.environ["APP_ENV"] = "testing"
    os.environ["DATABASE_URL"] = TEST_DATABASE_URL
    os.environ["JWT_SECRET_KEY"] = "test-secret-key-for-testing-only-at-least-32-chars-long"


@pytest.fixture(scope="function")
def db_session():
    """Provide a clean database session for each test function."""
    Base.metadata.create_all(bind=test_engine)
    session = TestingSessionLocal()

    # Pre-seed default roles
    admin_role = Role(id=1, name="ADMIN", description="Administrator")
    customer_role = Role(id=2, name="CUSTOMER", description="Customer")
    session.add_all([admin_role, customer_role])
    session.commit()

    try:
        yield session
    finally:
        session.rollback()
        session.close()
        Base.metadata.drop_all(bind=test_engine)


@pytest.fixture(scope="function")
def client(db_session):
    """FastAPI TestClient with overridden get_db dependency."""
    app = create_application()

    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()

