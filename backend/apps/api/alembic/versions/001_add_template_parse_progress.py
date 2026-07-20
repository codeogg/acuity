"""add template parse progress columns

Revision ID: 001_parse_progress
Revises:
Create Date: 2026-07-04
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "001_parse_progress"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "policy_template",
        sa.Column("parse_progress", sa.SmallInteger(), server_default="0", nullable=False),
    )
    op.add_column(
        "policy_template",
        sa.Column("parse_message", sa.String(255), nullable=True),
    )
    op.add_column(
        "policy_template",
        sa.Column("parse_job_id", sa.String(64), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("policy_template", "parse_job_id")
    op.drop_column("policy_template", "parse_message")
    op.drop_column("policy_template", "parse_progress")
