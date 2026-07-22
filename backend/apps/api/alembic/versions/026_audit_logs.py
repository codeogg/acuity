"""Unify operator audit onto audit_logs; drop clinic_retention_audit_logs."""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "026_audit_logs"
down_revision: str | None = "025_clinic_retention"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(sa.text("CREATE SEQUENCE IF NOT EXISTS audit_event_code_seq START WITH 9000"))

    op.create_table(
        "audit_logs",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("event_code", sa.String(length=32), nullable=False),
        sa.Column("action_type", sa.String(length=50), nullable=False),
        sa.Column(
            "operator_id",
            sa.BigInteger(),
            sa.ForeignKey("admin_user.id"),
            nullable=False,
        ),
        sa.Column(
            "clinic_id",
            sa.BigInteger(),
            sa.ForeignKey("clinic.id"),
            nullable=True,
        ),
        sa.Column("target_ref", sa.String(length=255), nullable=True),
        sa.Column("mode", sa.String(length=20), nullable=True),
        sa.Column("field_set", sa.String(length=255), nullable=True),
        sa.Column("detail", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.UniqueConstraint("event_code", name="uq_audit_logs_event_code"),
    )
    op.create_index("ix_audit_logs_event_code", "audit_logs", ["event_code"])
    op.create_index("ix_audit_logs_action_type", "audit_logs", ["action_type"])
    op.create_index("ix_audit_logs_operator_id", "audit_logs", ["operator_id"])
    op.create_index("ix_audit_logs_clinic_id", "audit_logs", ["clinic_id"])
    op.create_index("ix_audit_logs_created_at", "audit_logs", ["created_at"])

    # Migrate any existing retention audit rows into the unified table.
    op.execute(
        sa.text(
            """
            INSERT INTO audit_logs (
                event_code, action_type, operator_id, clinic_id,
                target_ref, mode, field_set, detail, created_at
            )
            SELECT
                'EV-' || nextval('audit_event_code_seq'),
                'retention_override',
                a.operated_by,
                a.clinic_id,
                c.clinic_code,
                NULL,
                'retention',
                jsonb_build_object(
                    'clinic_code_input', a.clinic_code_input,
                    'old_retention_days', a.old_retention_days,
                    'new_retention_days', a.new_retention_days,
                    'ip_address', a.ip_address
                ),
                a.operated_at
            FROM clinic_retention_audit_logs a
            LEFT JOIN clinic c ON c.id = a.clinic_id
            ORDER BY a.id ASC
            """
        )
    )

    op.drop_index(
        "ix_clinic_retention_audit_logs_operated_at",
        table_name="clinic_retention_audit_logs",
    )
    op.drop_index(
        "ix_clinic_retention_audit_logs_clinic_id",
        table_name="clinic_retention_audit_logs",
    )
    op.drop_table("clinic_retention_audit_logs")


def downgrade() -> None:
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

    op.drop_index("ix_audit_logs_created_at", table_name="audit_logs")
    op.drop_index("ix_audit_logs_clinic_id", table_name="audit_logs")
    op.drop_index("ix_audit_logs_operator_id", table_name="audit_logs")
    op.drop_index("ix_audit_logs_action_type", table_name="audit_logs")
    op.drop_index("ix_audit_logs_event_code", table_name="audit_logs")
    op.drop_table("audit_logs")
    op.execute(sa.text("DROP SEQUENCE IF EXISTS audit_event_code_seq"))
