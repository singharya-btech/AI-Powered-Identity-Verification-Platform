"""Add face verification fields to kyc_sessions

Revision ID: 0003_add_face_verification_fields
Revises: 0002_add_kyc_ocr_fields
Create Date: 2026-11-04 23:54:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0003_add_face_verification_fields"
down_revision: Union[str, None] = "0002_add_kyc_ocr_fields"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("kyc_sessions", sa.Column("face_match_score", sa.Float(), nullable=True))
    op.add_column("kyc_sessions", sa.Column("face_match_status", sa.String(length=50), nullable=True))
    op.add_column(
        "kyc_sessions",
        sa.Column("face_verified", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "kyc_sessions",
        sa.Column("biometric_consent", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )


def downgrade() -> None:
    op.drop_column("kyc_sessions", "biometric_consent")
    op.drop_column("kyc_sessions", "face_verified")
    op.drop_column("kyc_sessions", "face_match_status")
    op.drop_column("kyc_sessions", "face_match_score")

