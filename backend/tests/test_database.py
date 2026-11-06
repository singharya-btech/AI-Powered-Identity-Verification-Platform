"""Tests for database connectivity and session lifecycle management."""

import pytest
from unittest.mock import MagicMock, patch
from sqlalchemy import text
from sqlalchemy.orm import Session, sessionmaker

from backend.app.db.session import (
    check_db_connection,
    create_db_engine,
    get_db,
)


def test_create_db_engine_sqlite():
    """Verify engine creation for SQLite."""
    sqlite_engine = create_db_engine("sqlite:///:memory:")
    assert sqlite_engine.dialect.name == "sqlite"
    sqlite_engine.dispose()


def test_create_db_engine_postgres():
    """Verify engine configuration parameters for PostgreSQL URL."""
    pg_url = "postgresql://user:pass@localhost:5432/testdb"
    pg_engine = create_db_engine(pg_url)
    assert pg_engine.dialect.name == "postgresql"
    assert pg_engine.pool.size() >= 0
    pg_engine.dispose()


def test_check_db_connection_success():
    """Verify check_db_connection returns True when database executes queries."""
    with patch("backend.app.db.session.engine") as mock_engine:
        mock_conn = MagicMock()
        mock_engine.connect.return_value.__enter__.return_value = mock_conn
        mock_conn.execute.return_value = None

        ok, err = check_db_connection()
        assert ok is True
        assert err is None


def test_check_db_connection_failure():
    """Verify check_db_connection handles exceptions gracefully."""
    with patch("backend.app.db.session.engine") as mock_engine:
        mock_engine.connect.side_effect = Exception("Database host unreachable")

        ok, err = check_db_connection()
        assert ok is False
        assert "Database host unreachable" in err


def test_get_db_session_lifecycle():
    """Verify get_db dependency yields a valid session and closes it."""
    test_engine = create_db_engine("sqlite:///:memory:")
    TestSession = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)

    with patch("backend.app.db.session.SessionLocal", TestSession):
        db_gen = get_db()
        session = next(db_gen)
        assert isinstance(session, Session)

        # Session can execute queries
        result = session.execute(text("SELECT 1")).scalar()
        assert result == 1

        # Cleanup closes the session
        with pytest.raises(StopIteration):
            next(db_gen)

    test_engine.dispose()
