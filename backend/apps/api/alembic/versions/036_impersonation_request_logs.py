"""impersonation_request_logs — 模拟会话内逐请求审计流水"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "036_impersonation_request_logs"
down_revision: str | None = "035_impersonation_sessions"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "impersonation_request_logs",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column(
            "session_id",
            sa.BigInteger(),
            sa.ForeignKey("impersonation_sessions.id"),
            nullable=False,
        ),
        sa.Column(
            "operator_id",
            sa.BigInteger(),
            sa.ForeignKey("admin_user.id"),
            nullable=False,
        ),
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
        sa.Column("mode", sa.String(length=20), nullable=False),
        sa.Column("path", sa.String(length=512), nullable=False),
        sa.Column("method", sa.String(length=10), nullable=False),
        sa.Column("http_status", sa.Integer(), nullable=False),
        sa.Column("ip", sa.String(length=64), nullable=True),
        sa.Column("latency_ms", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("access_level", sa.String(length=20), nullable=False),
        sa.Column("decision", sa.String(length=20), nullable=False),
        sa.Column("deny_code", sa.String(length=50), nullable=True),
        sa.Column(
            "sensitive",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column("resource_type", sa.String(length=100), nullable=True),
        sa.Column("resource_id", sa.String(length=100), nullable=True),
        sa.Column("request_params", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("before_state", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("after_state", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("field_diff", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.CheckConstraint("mode IN ('view', 'proxy')", name="ck_imp_req_logs_mode"),
        sa.CheckConstraint(
            "decision IN ('allowed', 'denied')",
            name="ck_imp_req_logs_decision",
        ),
        comment="模拟会话内逐请求审计流水（append-only）",
    )
    op.create_index(
        "idx_imp_req_logs_session_created",
        "impersonation_request_logs",
        ["session_id", "created_at"],
    )
    op.create_index(
        "idx_imp_req_logs_operator_created",
        "impersonation_request_logs",
        ["operator_id", "created_at"],
    )
    op.create_index(
        "idx_imp_req_logs_doctor_created",
        "impersonation_request_logs",
        ["doctor_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index(
        "idx_imp_req_logs_doctor_created",
        table_name="impersonation_request_logs",
    )
    op.drop_index(
        "idx_imp_req_logs_operator_created",
        table_name="impersonation_request_logs",
    )
    op.drop_index(
        "idx_imp_req_logs_session_created",
        table_name="impersonation_request_logs",
    )
    op.drop_table("impersonation_request_logs")
