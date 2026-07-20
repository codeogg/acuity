"""add ocr_result table for Step3 OCR

Revision ID: 005_ocr_result
Revises: 004_document_page
Create Date: 2026-07-10
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "005_ocr_result"
down_revision: Union[str, None] = "004_document_page"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "ocr_result",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column(
            "task_id",
            sa.BigInteger(),
            sa.ForeignKey("extraction_task.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("page_no", sa.Integer(), nullable=False),
        sa.Column("blocks", JSONB(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("task_id", "page_no", name="uq_ocr_result_task_page"),
    )
    op.create_index("idx_ocr_result_task", "ocr_result", ["task_id"])


def downgrade() -> None:
    op.drop_index("idx_ocr_result_task", table_name="ocr_result")
    op.drop_table("ocr_result")
