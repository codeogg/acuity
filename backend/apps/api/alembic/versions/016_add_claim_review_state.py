"""add claim review confirmation and optimistic-lock state"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "016_add_claim_review_state"
down_revision: str | None = "015_unique_clinic_name"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "claim_submission",
        sa.Column("field_confirmations", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    op.add_column(
        "claim_submission",
        sa.Column("row_version", sa.Integer(), nullable=False, server_default="1"),
    )


def downgrade() -> None:
    op.drop_column("claim_submission", "row_version")
    op.drop_column("claim_submission", "field_confirmations")
