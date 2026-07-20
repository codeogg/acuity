"""add document_page table for Step2 PDF preprocess

Revision ID: 004_document_page
Revises: 003_extraction_task
Create Date: 2026-07-10
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "004_document_page"
down_revision: Union[str, None] = "003_extraction_task"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "document_page",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column(
            "task_id",
            sa.BigInteger(),
            sa.ForeignKey("extraction_task.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("page_no", sa.Integer(), nullable=False),
        sa.Column("source", sa.String(20), nullable=False),
        sa.Column("text", sa.Text(), nullable=True),
        sa.Column("image_path", sa.String(512), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("task_id", "page_no", name="uq_document_page_task_page"),
    )
    op.create_index("idx_document_page_task", "document_page", ["task_id"])


def downgrade() -> None:
    op.drop_index("idx_document_page_task", table_name="document_page")
    op.drop_table("document_page")
