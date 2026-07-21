"""clinic/doctor idle_lock_minutes — real idle screen lock configuration"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "019_idle_lock_minutes"
down_revision: str | None = "018_doctor_clinic_link"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "clinic",
        sa.Column(
            "idle_lock_minutes",
            sa.SmallInteger(),
            nullable=False,
            server_default="10",
        ),
    )
    op.add_column(
        "doctor",
        sa.Column("idle_lock_minutes", sa.SmallInteger(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("doctor", "idle_lock_minutes")
    op.drop_column("clinic", "idle_lock_minutes")
