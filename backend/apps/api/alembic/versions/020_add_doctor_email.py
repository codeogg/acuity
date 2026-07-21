"""doctor.email — contact email for doctor accounts"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "020_add_doctor_email"
down_revision: str | None = "019_idle_lock_minutes"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "doctor",
        sa.Column("email", sa.String(255), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("doctor", "email")
