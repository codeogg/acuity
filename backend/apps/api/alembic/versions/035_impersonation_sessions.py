"""impersonation_sessions — 运营模拟会话表"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "035_impersonation_sessions"
down_revision: str | None = "034_drop_clinic_onboarding"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "impersonation_sessions",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column(
            "clinic_id",
            sa.BigInteger(),
            sa.ForeignKey("clinic.id"),
            nullable=False,
        ),
        sa.Column(
            "doctor_id",
            sa.BigInteger(),
            sa.ForeignKey("doctor.id"),
            nullable=False,
        ),
        sa.Column(
            "operator_id",
            sa.BigInteger(),
            sa.ForeignKey("admin_user.id"),
            nullable=False,
        ),
        sa.Column("mode", sa.String(length=20), nullable=False),
        sa.Column("reason", sa.String(length=255), nullable=True),
        sa.Column(
            "status",
            sa.String(length=20),
            nullable=False,
            server_default="active",
        ),
        sa.Column(
            "started_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expire_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_active_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("doctor_notified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("doctor_acknowledged_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "mode IN ('view', 'proxy')",
            name="ck_impersonation_sessions_mode",
        ),
        sa.CheckConstraint(
            "status IN ('active', 'ended', 'expired')",
            name="ck_impersonation_sessions_status",
        ),
        sa.ForeignKeyConstraint(
            ["doctor_id", "clinic_id"],
            ["doctor_clinic_link.doctor_id", "doctor_clinic_link.clinic_id"],
            name="fk_impersonation_sessions_doctor_clinic_link",
        ),
        comment="运营模拟会话：按 clinic+doctor 隔离的临时授权生命周期",
    )

    op.create_index(
        "idx_impersonation_sessions_clinic",
        "impersonation_sessions",
        ["clinic_id"],
    )
    op.create_index(
        "idx_impersonation_sessions_doctor",
        "impersonation_sessions",
        ["doctor_id"],
    )
    op.create_index(
        "idx_impersonation_sessions_operator",
        "impersonation_sessions",
        ["operator_id"],
    )
    op.create_index(
        "idx_impersonation_sessions_operator_status",
        "impersonation_sessions",
        ["operator_id", "status"],
    )
    op.create_index(
        "idx_impersonation_sessions_doctor_status",
        "impersonation_sessions",
        ["doctor_id", "status"],
    )
    op.create_index(
        "idx_impersonation_sessions_expire_active",
        "impersonation_sessions",
        ["expire_at"],
        postgresql_where=sa.text("status = 'active'"),
    )
    op.create_index(
        "uq_impersonation_sessions_active_clinic_doctor",
        "impersonation_sessions",
        ["clinic_id", "doctor_id"],
        unique=True,
        postgresql_where=sa.text("status = 'active'"),
    )


def downgrade() -> None:
    op.drop_index(
        "uq_impersonation_sessions_active_clinic_doctor",
        table_name="impersonation_sessions",
    )
    op.drop_index(
        "idx_impersonation_sessions_expire_active",
        table_name="impersonation_sessions",
    )
    op.drop_index(
        "idx_impersonation_sessions_doctor_status",
        table_name="impersonation_sessions",
    )
    op.drop_index(
        "idx_impersonation_sessions_operator_status",
        table_name="impersonation_sessions",
    )
    op.drop_index(
        "idx_impersonation_sessions_operator",
        table_name="impersonation_sessions",
    )
    op.drop_index(
        "idx_impersonation_sessions_doctor",
        table_name="impersonation_sessions",
    )
    op.drop_index(
        "idx_impersonation_sessions_clinic",
        table_name="impersonation_sessions",
    )
    op.drop_table("impersonation_sessions")
