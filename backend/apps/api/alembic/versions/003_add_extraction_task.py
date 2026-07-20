"""add extraction_task table for PDF extraction pipeline

Revision ID: 003_extraction_task
Revises: 002_field_status
Create Date: 2026-07-10
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "003_extraction_task"
down_revision: Union[str, None] = "002_field_status"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "extraction_task",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("task_no", sa.String(50), nullable=False, unique=True),
        sa.Column("clinic_id", sa.BigInteger(), sa.ForeignKey("clinic.id"), nullable=False),
        sa.Column("doctor_id", sa.BigInteger(), sa.ForeignKey("doctor.id"), nullable=False),
        sa.Column("patient_name", sa.String(100), nullable=True),
        sa.Column("original_filename", sa.String(255), nullable=False),
        sa.Column("pdf_url", sa.String(512), nullable=False),
        sa.Column("file_size_bytes", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(30), nullable=False, server_default="WAITING"),
        sa.Column("current_step", sa.String(30), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_extraction_task_clinic", "extraction_task", ["clinic_id"])
    op.create_index("idx_extraction_task_status", "extraction_task", ["status"])


def downgrade() -> None:
    op.drop_index("idx_extraction_task_status", table_name="extraction_task")
    op.drop_index("idx_extraction_task_clinic", table_name="extraction_task")
    op.drop_table("extraction_task")
