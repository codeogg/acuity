"""add template_field field_status and ignore_reason

Revision ID: 002_field_status
Revises: 001_parse_progress
Create Date: 2026-07-04
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "002_field_status"
down_revision: Union[str, None] = "001_parse_progress"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "template_field",
        sa.Column(
            "field_status",
            sa.String(20),
            server_default="PENDING",
            nullable=False,
        ),
    )
    op.add_column(
        "template_field",
        sa.Column("ignore_reason", sa.String(255), nullable=True),
    )
    op.execute(
        """
        UPDATE template_field
        SET field_status = 'MAPPED'
        WHERE is_confirmed = TRUE
        """
    )


def downgrade() -> None:
    op.drop_column("template_field", "ignore_reason")
    op.drop_column("template_field", "field_status")
