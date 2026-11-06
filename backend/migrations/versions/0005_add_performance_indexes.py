"""Add performance indexes for kyc_sessions workflow queries

Revision ID: 0005_add_performance_indexes
Revises: 0004_add_kyc_workflow_fields
Create Date: 2026-11-05 01:35:00.000000

"""
from typing import Sequence, Union
from alembic import op


# revision identifiers, used by Alembic.
revision: str = "0005_add_performance_indexes"
down_revision: Union[str, None] = "0004_add_kyc_workflow_fields"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("kyc_sessions") as batch_op:
        batch_op.create_index("ix_kyc_sessions_workflow_status", ["workflow_status"], unique=False)
        batch_op.create_index("ix_kyc_sessions_created_at", ["created_at"], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("kyc_sessions") as batch_op:
        batch_op.drop_index("ix_kyc_sessions_created_at")
        batch_op.drop_index("ix_kyc_sessions_workflow_status")

