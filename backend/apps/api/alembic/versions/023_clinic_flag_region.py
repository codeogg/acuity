"""clinic.data_region + clinic.is_flagged."""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "023_clinic_flag_region"
down_revision: str | None = "022_districts"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "clinic",
        sa.Column(
            "data_region",
            sa.String(length=20),
            nullable=False,
            server_default="香港",
        ),
    )
    op.add_column(
        "clinic",
        sa.Column(
            "is_flagged",
            sa.SmallInteger(),
            nullable=False,
            server_default="0",
        ),
    )
    op.create_index("ix_clinic_is_flagged", "clinic", ["is_flagged"])


def downgrade() -> None:
    op.drop_index("ix_clinic_is_flagged", table_name="clinic")
    op.drop_column("clinic", "is_flagged")
    op.drop_column("clinic", "data_region")
