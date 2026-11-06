"""Tests for Alembic database migration execution."""

import os
from pathlib import Path
import pytest
from sqlalchemy import create_engine, inspect, text
from alembic.config import Config
from alembic import command


@pytest.fixture
def temp_db_path(tmp_path):
    """Provide an isolated SQLite database file for testing migration upgrade and rollback."""
    db_file = tmp_path / "test_migration.sqlite3"
    return f"sqlite:///{db_file.as_posix()}"


def test_alembic_migration_upgrade_and_downgrade(temp_db_path):
    """Verify applying migrations from base to head and rolling back cleanly."""
    project_root = Path(__file__).resolve().parents[2]
    alembic_ini_path = project_root / "alembic.ini"

    alembic_cfg = Config(str(alembic_ini_path))
    alembic_cfg.set_main_option("script_location", str(project_root / "backend" / "migrations"))
    alembic_cfg.set_main_option("sqlalchemy.url", temp_db_path)

    # Set environment variable so env.py picks it up
    os.environ["DATABASE_URL"] = temp_db_path

    # 1. Upgrade to head
    command.upgrade(alembic_cfg, "head")

    test_engine = create_engine(temp_db_path)
    inspector = inspect(test_engine)
    tables = inspector.get_table_names()

    assert "roles" in tables
    assert "users" in tables
    assert "kyc_sessions" in tables
    assert "audit_logs" in tables
    assert "alembic_version" in tables

    # Verify seeded roles exist
    with test_engine.connect() as conn:
        roles = conn.execute(text("SELECT name FROM roles ORDER BY id")).fetchall()
        assert [r[0] for r in roles] == ["ADMIN", "CUSTOMER"]

    test_engine.dispose()

    # 2. Downgrade back to base
    command.downgrade(alembic_cfg, "base")

    verify_engine = create_engine(temp_db_path)
    inspector2 = inspect(verify_engine)
    remaining_tables = [t for t in inspector2.get_table_names() if t != "alembic_version"]
    assert len(remaining_tables) == 0, f"Expected tables to be dropped on downgrade, found: {remaining_tables}"
    verify_engine.dispose()
