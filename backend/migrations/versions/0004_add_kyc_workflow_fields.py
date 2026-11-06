"""Add KYC workflow and admin review fields to kyc_sessions

Revision ID: 0004_add_kyc_workflow_fields
Revises: 0003_add_face_verification_fields
Create Date: 2026-11-05 01:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0004_add_kyc_workflow_fields"
down_revision: Union[str, None] = "0003_add_face_verification_fields"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("kyc_sessions") as batch_op:
        batch_op.add_column(
            sa.Column("workflow_status", sa.String(length=50), nullable=False, server_default="NOT_STARTED")
        )
        batch_op.add_column(sa.Column("admin_review_status", sa.String(length=50), nullable=True))
        batch_op.add_column(sa.Column("admin_reviewed_by", sa.Uuid(), nullable=True))
        batch_op.add_column(sa.Column("admin_reviewed_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column("rejection_reason", sa.String(length=500), nullable=True))
        batch_op.create_foreign_key(
            "fk_kyc_sessions_admin_reviewed_by",
            "users",
            ["admin_reviewed_by"],
            ["id"],
            ondelete="SET NULL",
        )


def downgrade() -> None:
    with op.batch_alter_table("kyc_sessions") as batch_op:
        batch_op.drop_constraint("fk_kyc_sessions_admin_reviewed_by", type_="foreignkey")
        batch_op.drop_column("rejection_reason")
        batch_op.drop_column("admin_reviewed_at")
        batch_op.drop_column("admin_reviewed_by")
        batch_op.drop_column("admin_review_status")
        batch_op.drop_column("workflow_status")

