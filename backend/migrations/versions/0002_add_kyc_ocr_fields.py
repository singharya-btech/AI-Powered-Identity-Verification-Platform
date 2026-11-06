"""Add OCR metadata fields to kyc_sessions

Revision ID: 0002_add_kyc_ocr_fields
Revises: 0001_initial_schema
Create Date: 2026-11-04 23:20:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0002_add_kyc_ocr_fields"
down_revision: Union[str, None] = "0001_initial_schema"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("kyc_sessions", sa.Column("document_number_masked", sa.String(length=50), nullable=True))
    op.add_column("kyc_sessions", sa.Column("extracted_name", sa.String(length=255), nullable=True))
    op.add_column("kyc_sessions", sa.Column("extracted_dob", sa.String(length=50), nullable=True))
    op.add_column("kyc_sessions", sa.Column("extracted_gender", sa.String(length=20), nullable=True))
    op.add_column("kyc_sessions", sa.Column("ocr_confidence", sa.Float(), nullable=True))
    op.add_column("kyc_sessions", sa.Column("failure_reason", sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column("kyc_sessions", "failure_reason")
    op.drop_column("kyc_sessions", "ocr_confidence")
    op.drop_column("kyc_sessions", "extracted_gender")
    op.drop_column("kyc_sessions", "extracted_dob")
    op.drop_column("kyc_sessions", "extracted_name")
    op.drop_column("kyc_sessions", "document_number_masked")

