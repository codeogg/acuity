"""add extraction_mapped_result table for Step10 insurance mapper

Revision ID: 009_extraction_mapped_result
Revises: 008_extraction_prompt_result
Create Date: 2026-07-10
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "009_extraction_mapped_result"
down_revision: Union[str, None] = "008_extraction_prompt_result"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "extraction_mapped_result",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column(
            "task_id",
            sa.BigInteger(),
            sa.ForeignKey("extraction_task.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("insurance_company", sa.String(100), nullable=False),
        sa.Column(
            "template_id",
            sa.BigInteger(),
            sa.ForeignKey("policy_template.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("mapping_source", sa.String(20), nullable=False, server_default="fallback"),
        sa.Column("fields", JSONB(), nullable=False),
        sa.Column("unmapped_fields", JSONB(), nullable=False, server_default="[]"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index(
        "idx_extraction_mapped_result_task", "extraction_mapped_result", ["task_id"]
    )


def downgrade() -> None:
    op.drop_index("idx_extraction_mapped_result_task", table_name="extraction_mapped_result")
    op.drop_table("extraction_mapped_result")
