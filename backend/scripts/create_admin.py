"""Administrator Provisioning Script.

Securely creates the initial platform administrator account without exposing
an admin creation API endpoint.

Usage:
  python -m backend.scripts.create_admin
  python -m backend.scripts.create_admin --email admin@example.com --password "Secure#Admin2026" --name "Super Admin"

Or via Environment Variables:
  ADMIN_EMAIL="admin@example.com"
  ADMIN_PASSWORD="Secure#Admin2026"
  ADMIN_FULL_NAME="Super Admin"
  python -m backend.scripts.create_admin
"""

import argparse
import getpass
import os
import sys
from pathlib import Path

# Add project root to path
project_root = Path(__file__).resolve().parents[2]
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

from sqlalchemy import func, select
from backend.app.core.security import get_password_hash, validate_password_strength
from backend.app.db.session import SessionLocal
from backend.app.models.audit_log import AuditLog
from backend.app.models.role import Role
from backend.app.models.user import User


def provision_admin(
    email: str,
    password: str,
    full_name: str = "System Administrator",
    session=None,
) -> tuple[bool, str]:
    """Provision an administrator account in the database.

    Returns:
        (True, success_message) or (False, error_message)
    """
    normalized_email = email.lower().strip()
    if not normalized_email or "@" not in normalized_email:
        return False, "Invalid email address."

    try:
        validate_password_strength(password)
    except ValueError as exc:
        return False, f"Password complexity error: {exc}"

    db = session or SessionLocal()
    try:
        # Check if role exists
        admin_role = db.execute(select(Role).where(Role.name == "ADMIN")).scalar_one_or_none()
        if not admin_role:
            admin_role = Role(id=1, name="ADMIN", description="System Administrator with full access")
            db.add(admin_role)
            db.flush()

        # Check for existing user
        existing_user = db.execute(
            select(User).where(func.lower(User.email) == normalized_email)
        ).scalar_one_or_none()

        if existing_user:
            if existing_user.role_id == admin_role.id:
                # Synchronize password and full name with .env configuration
                existing_user.password_hash = get_password_hash(password)
                if full_name and full_name.strip():
                    existing_user.full_name = full_name.strip()
                existing_user.is_active = True
                existing_user.is_verified = True
                db.commit()
                return True, f"Administrator account '{normalized_email}' already exists; credentials synchronized with .env successfully."
            else:
                # Promote existing customer to admin
                existing_user.role_id = admin_role.id
                existing_user.is_active = True
                existing_user.is_verified = True
                db.add(
                    AuditLog(
                        user_id=existing_user.id,
                        action="USER_PROMOTED_TO_ADMIN",
                        resource_type="user",
                        resource_id=str(existing_user.id),
                    )
                )
                db.commit()
                return True, f"Existing account '{normalized_email}' promoted to ADMIN successfully."

        # Create new admin
        hashed = get_password_hash(password)
        new_admin = User(
            full_name=full_name.strip(),
            email=normalized_email,
            password_hash=hashed,
            role_id=admin_role.id,
            is_active=True,
            is_verified=True,
        )
        db.add(new_admin)
        db.flush()

        # Audit trail
        db.add(
            AuditLog(
                user_id=new_admin.id,
                action="ADMIN_PROVISIONED",
                resource_type="user",
                resource_id=str(new_admin.id),
            )
        )
        db.commit()
        return True, f"Administrator '{normalized_email}' successfully provisioned with ID {new_admin.id}."
    except Exception as exc:
        db.rollback()
        return False, f"Database error during admin provisioning: {exc}"
    finally:
        if not session:
            db.close()


def main():
    parser = argparse.ArgumentParser(description="Provision an initial platform administrator")
    parser.add_argument("--email", help="Administrator email address")
    parser.add_argument("--password", help="Administrator password")
    parser.add_argument("--name", default="System Administrator", help="Administrator full name")
    args = parser.parse_args()

    email = args.email or os.getenv("ADMIN_EMAIL")
    password = args.password or os.getenv("ADMIN_PASSWORD")
    name = args.name or os.getenv("ADMIN_FULL_NAME", "System Administrator")

    if not email:
        email = input("Enter Administrator Email: ").strip()
    if not password:
        password = getpass.getpass("Enter Administrator Password: ").strip()

    success, message = provision_admin(email=email, password=password, full_name=name)
    if success:
        print(f"[SUCCESS] {message}")
        sys.exit(0)
    else:
        print(f"[ERROR] {message}")
        sys.exit(1)


if __name__ == "__main__":
    main()

