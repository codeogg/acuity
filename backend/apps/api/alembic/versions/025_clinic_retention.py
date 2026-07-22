"""clinic retention — global policy, per-clinic override, append-only audit."""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "025_clinic_retention"
down_revision: str | None = "024_clinic_subscriptions"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "retention_policies",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("policy_name", sa.String(length=100), nullable=False),
        sa.Column("retention_days", sa.Integer(), nullable=False),
        sa.Column(
            "is_default", sa.SmallInteger(), nullable=False, server_default="0"
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )

    op.create_table(
        "clinic_data_retention",
        sa.Column(
            "clinic_id",
            sa.BigInteger(),
            sa.ForeignKey("clinic.id"),
            primary_key=True,
        ),
        sa.Column(
            "is_overridden", sa.SmallInteger(), nullable=False, server_default="0"
        ),
        sa.Column("retention_days", sa.Integer(), nullable=True),
        sa.Column(
            "overridden_by",
            sa.BigInteger(),
            sa.ForeignKey("admin_user.id"),
            nullable=True,
        ),
        sa.Column("overridden_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        "clinic_retention_audit_logs",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column(
            "clinic_id",
            sa.BigInteger(),
            sa.ForeignKey("clinic.id"),
            nullable=False,
        ),
        sa.Column("clinic_code_input", sa.String(length=50), nullable=False),
        sa.Column("old_retention_days", sa.Integer(), nullable=False),
        sa.Column("new_retention_days", sa.Integer(), nullable=False),
        sa.Column(
            "operated_by",
            sa.BigInteger(),
            sa.ForeignKey("admin_user.id"),
            nullable=False,
        ),
        sa.Column(
            "operated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("ip_address", sa.String(length=45), nullable=True),
    )
    op.create_index(
        "ix_clinic_retention_audit_logs_clinic_id",
        "clinic_retention_audit_logs",
        ["clinic_id"],
    )
    op.create_index(
        "ix_clinic_retention_audit_logs_operated_at",
        "clinic_retention_audit_logs",
        ["operated_at"],
    )

    # Seed the global default policy (~7 years).
    op.execute(
        sa.text(
            """
            INSERT INTO retention_policies (
                policy_name, retention_days, is_default, updated_at
            )
            VALUES ('標準保留政策', 2555, 1, now())
            """
        )
    )


def downgrade() -> None:
    op.drop_index(
        "ix_clinic_retention_audit_logs_operated_at",
        table_name="clinic_retention_audit_logs",
    )
    op.drop_index(
        "ix_clinic_retention_audit_logs_clinic_id",
        table_name="clinic_retention_audit_logs",
    )
    op.drop_table("clinic_retention_audit_logs")
    op.drop_table("clinic_data_retention")
    op.drop_table("retention_policies")
