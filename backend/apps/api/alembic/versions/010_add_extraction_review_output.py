"""add extraction_review_output table for Step11 human review

Revision ID: 010_extraction_review_output
Revises: 009_extraction_mapped_result
Create Date: 2026-07-10
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "010_extraction_review_output"
down_revision: Union[str, None] = "009_extraction_mapped_result"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "extraction_review_output",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column(
            "task_id",
            sa.BigInteger(),
            sa.ForeignKey("extraction_task.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("insurance_company", sa.String(100), nullable=True),
        sa.Column("standard_fields", JSONB(), nullable=False),
        sa.Column("edited_fields", JSONB(), nullable=True),
        sa.Column("mapped_fields", JSONB(), nullable=True),
        sa.Column("is_confirmed", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("reviewed_by_id", sa.BigInteger(), sa.ForeignKey("doctor.id"), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index(
        "idx_extraction_review_output_task", "extraction_review_output", ["task_id"]
    )


def downgrade() -> None:
    op.drop_index("idx_extraction_review_output_task", table_name="extraction_review_output")
    op.drop_table("extraction_review_output")
