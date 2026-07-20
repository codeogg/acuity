"""add extraction_prompt and extraction_result for Step6/7

Revision ID: 008_extraction_prompt_result
Revises: 007_extraction_visit
Create Date: 2026-07-10
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "008_extraction_prompt_result"
down_revision: Union[str, None] = "007_extraction_visit"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "extraction_prompt",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column(
            "task_id",
            sa.BigInteger(),
            sa.ForeignKey("extraction_task.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("prompt_text", sa.Text(), nullable=False),
        sa.Column("field_codes", JSONB(), nullable=False),
        sa.Column("selected_visit_index", sa.Integer(), nullable=True),
        sa.Column("source_text_chars", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("source_pages_used", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_extraction_prompt_task", "extraction_prompt", ["task_id"])

    op.create_table(
        "extraction_result",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column(
            "task_id",
            sa.BigInteger(),
            sa.ForeignKey("extraction_task.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("fields", JSONB(), nullable=False),
        sa.Column("model_name", sa.String(100), nullable=True),
        sa.Column("token_usage", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("stub", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("stage", sa.String(20), nullable=False, server_default="raw"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_extraction_result_task", "extraction_result", ["task_id"])


def downgrade() -> None:
    op.drop_index("idx_extraction_result_task", table_name="extraction_result")
    op.drop_table("extraction_result")
    op.drop_index("idx_extraction_prompt_task", table_name="extraction_prompt")
    op.drop_table("extraction_prompt")
