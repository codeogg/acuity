"""districts dictionary + clinic.district_id FK."""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "022_districts"
down_revision: str | None = "021_form_tags"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "districts",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("name_zh", sa.String(length=100), nullable=False),
        sa.Column("name_en", sa.String(length=100), nullable=True),
        sa.Column("region", sa.String(length=50), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index("ix_districts_name_zh", "districts", ["name_zh"])
    op.create_index("ix_districts_region", "districts", ["region"])

    op.add_column(
        "clinic",
        sa.Column("district_id", sa.BigInteger(), nullable=True),
    )
    op.create_foreign_key(
        "fk_clinic_district_id",
        "clinic",
        "districts",
        ["district_id"],
        ["id"],
    )
    op.create_index("ix_clinic_district_id", "clinic", ["district_id"])


def downgrade() -> None:
    op.drop_index("ix_clinic_district_id", table_name="clinic")
    op.drop_constraint("fk_clinic_district_id", "clinic", type_="foreignkey")
    op.drop_column("clinic", "district_id")
    op.drop_index("ix_districts_region", table_name="districts")
    op.drop_index("ix_districts_name_zh", table_name="districts")
    op.drop_table("districts")
