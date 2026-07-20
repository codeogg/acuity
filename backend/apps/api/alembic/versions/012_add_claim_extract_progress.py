"""claim_submission 增加 PDF 提取异步进度字段"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "012_claim_extract_progress"
down_revision: Union[str, None] = "011_claim_extraction_task"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "claim_submission",
        sa.Column("extract_status", sa.String(30), server_default="IDLE", nullable=False),
    )
    op.add_column("claim_submission", sa.Column("extract_stage", sa.String(30), nullable=True))
    op.add_column(
        "claim_submission",
        sa.Column("extract_progress", sa.Integer(), server_default="0", nullable=False),
    )
    op.add_column("claim_submission", sa.Column("extract_message", sa.String(255), nullable=True))
    op.add_column("claim_submission", sa.Column("extract_job_id", sa.String(100), nullable=True))
    op.add_column(
        "claim_submission",
        sa.Column("extract_manifest", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    for col in (
        "extract_manifest",
        "extract_job_id",
        "extract_message",
        "extract_progress",
        "extract_stage",
        "extract_status",
    ):
        op.drop_column("claim_submission", col)
