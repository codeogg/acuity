"""add extraction_visit table for Step5 visit detection

Revision ID: 007_extraction_visit
Revises: 006_document_classification
Create Date: 2026-07-10
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "007_extraction_visit"
down_revision: Union[str, None] = "006_document_classification"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "extraction_visit",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column(
            "task_id",
            sa.BigInteger(),
            sa.ForeignKey("extraction_task.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("visit_index", sa.Integer(), nullable=False),
        sa.Column("visit_date", sa.String(20), nullable=True),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("page_start", sa.Integer(), nullable=False),
        sa.Column("page_end", sa.Integer(), nullable=False),
        sa.Column("selected", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("model_name", sa.String(100), nullable=True),
        sa.Column("token_usage", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("stub", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("task_id", "visit_index", name="uq_extraction_visit_task_index"),
    )
    op.create_index("idx_extraction_visit_task", "extraction_visit", ["task_id"])


def downgrade() -> None:
    op.drop_index("idx_extraction_visit_task", table_name="extraction_visit")
    op.drop_table("extraction_visit")
