"""add document_classification table for Step4 classify

Revision ID: 006_document_classification
Revises: 005_ocr_result
Create Date: 2026-07-10
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "006_document_classification"
down_revision: Union[str, None] = "005_ocr_result"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "document_classification",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column(
            "task_id",
            sa.BigInteger(),
            sa.ForeignKey("extraction_task.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("document_type", sa.String(80), nullable=False),
        sa.Column("language", sa.String(20), nullable=False),
        sa.Column("multiple_patient", sa.Boolean(), nullable=False),
        sa.Column("multiple_visit", sa.Boolean(), nullable=False),
        sa.Column("insurance_company", sa.String(100), nullable=True),
        sa.Column("need_visit_selector", sa.Boolean(), nullable=False),
        sa.Column("source_text_chars", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("source_pages_used", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("model_name", sa.String(100), nullable=True),
        sa.Column("token_usage", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("stub", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index(
        "idx_document_classification_task", "document_classification", ["task_id"]
    )


def downgrade() -> None:
    op.drop_index("idx_document_classification_task", table_name="document_classification")
    op.drop_table("document_classification")
