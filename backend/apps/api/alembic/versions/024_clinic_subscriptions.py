"""clinic_subscriptions — 1:1 commercial record per clinic."""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "024_clinic_subscriptions"
down_revision: str | None = "023_clinic_flag_region"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "clinic_subscriptions",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("clinic_id", sa.BigInteger(), sa.ForeignKey("clinic.id"), nullable=False),
        sa.Column(
            "subscription_status",
            sa.String(length=20),
            nullable=False,
            server_default="trial",
        ),
        sa.Column("plan_code", sa.String(length=50), nullable=True),
        sa.Column("price", sa.Numeric(10, 2), nullable=True),
        sa.Column(
            "currency", sa.String(length=10), nullable=False, server_default="HKD"
        ),
        sa.Column("payment_status", sa.String(length=20), nullable=True),
        sa.Column("payment_method", sa.String(length=20), nullable=True),
        sa.Column("note_content", sa.Text(), nullable=True),
        sa.Column(
            "note_format",
            sa.String(length=20),
            nullable=False,
            server_default="markdown",
        ),
        sa.Column(
            "note_updated_by",
            sa.BigInteger(),
            sa.ForeignKey("admin_user.id"),
            nullable=True,
        ),
        sa.Column("note_updated_at", sa.DateTime(timezone=True), nullable=True),
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
        sa.UniqueConstraint("clinic_id", name="uq_clinic_subscriptions_clinic_id"),
    )
    op.create_index(
        "ix_clinic_subscriptions_clinic_id", "clinic_subscriptions", ["clinic_id"]
    )

    # Backfill existing clinics with a default trial subscription.
    op.execute(
        sa.text(
            """
            INSERT INTO clinic_subscriptions (
                clinic_id, subscription_status, currency, note_format, created_at, updated_at
            )
            SELECT
                c.id,
                'trial',
                'HKD',
                'markdown',
                now(),
                now()
            FROM clinic c
            WHERE NOT EXISTS (
                SELECT 1 FROM clinic_subscriptions s WHERE s.clinic_id = c.id
            )
            """
        )
    )


def downgrade() -> None:
    op.drop_index("ix_clinic_subscriptions_clinic_id", table_name="clinic_subscriptions")
    op.drop_table("clinic_subscriptions")
