"""doctor–clinic many-to-many link + doctor account columns

- Create doctor_clinic_link
- Add doctor.workspace_mode / doctor.account_notes
- Make doctor.clinic_id nullable (mirrors primary link; null = no links)
- Backfill one primary link per existing doctor that has clinic_id
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "018_doctor_clinic_link"
down_revision: str | None = "017_reconcile_bootstrap_schema"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "doctor_clinic_link",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column(
            "doctor_id",
            sa.BigInteger(),
            sa.ForeignKey("doctor.id"),
            nullable=False,
        ),
        sa.Column(
            "clinic_id",
            sa.BigInteger(),
            sa.ForeignKey("clinic.id"),
            nullable=False,
        ),
        sa.Column(
            "is_primary",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column(
            "linked_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
        ),
        sa.UniqueConstraint("doctor_id", "clinic_id", name="uq_doctor_clinic_link"),
    )
    op.create_index(
        "idx_doctor_clinic_link_doctor", "doctor_clinic_link", ["doctor_id"]
    )
    op.create_index(
        "idx_doctor_clinic_link_clinic", "doctor_clinic_link", ["clinic_id"]
    )

    op.add_column(
        "doctor",
        sa.Column(
            "workspace_mode",
            sa.String(20),
            server_default="separated",
            nullable=False,
        ),
    )
    op.add_column(
        "doctor",
        sa.Column("account_notes", sa.Text(), nullable=True),
    )

    op.alter_column(
        "doctor",
        "clinic_id",
        existing_type=sa.BigInteger(),
        nullable=True,
    )

    # One-shot backfill: existing doctors with a clinic_id get a primary link.
    op.execute(
        """
        INSERT INTO doctor_clinic_link (doctor_id, clinic_id, is_primary, linked_at)
        SELECT d.id, d.clinic_id, TRUE, NOW()
        FROM doctor AS d
        WHERE d.clinic_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM doctor_clinic_link AS l
            WHERE l.doctor_id = d.id AND l.clinic_id = d.clinic_id
          )
        """
    )


def downgrade() -> None:
    # Refuse to null out clinic_id rows that would violate the old NOT NULL
    # constraint; restore only when every doctor still has a clinic_id.
    op.execute(
        """
        UPDATE doctor AS d
        SET clinic_id = l.clinic_id
        FROM doctor_clinic_link AS l
        WHERE l.doctor_id = d.id
          AND l.is_primary = TRUE
          AND d.clinic_id IS NULL
        """
    )
    op.alter_column(
        "doctor",
        "clinic_id",
        existing_type=sa.BigInteger(),
        nullable=False,
    )
    op.drop_column("doctor", "account_notes")
    op.drop_column("doctor", "workspace_mode")
    op.drop_index("idx_doctor_clinic_link_clinic", table_name="doctor_clinic_link")
    op.drop_index("idx_doctor_clinic_link_doctor", table_name="doctor_clinic_link")
    op.drop_table("doctor_clinic_link")
