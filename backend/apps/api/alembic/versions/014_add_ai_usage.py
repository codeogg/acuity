"""新增 AI 用量、模型定价与月度诊所聚合视图"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "014_add_ai_usage"
down_revision: str | None = "013_template_mapping_ck"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "ai_model_pricing",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("model", sa.String(length=100), nullable=False),
        sa.Column(
            "input_price_per_million", sa.Numeric(precision=12, scale=4), nullable=False
        ),
        sa.Column(
            "output_price_per_million", sa.Numeric(precision=12, scale=4), nullable=False
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint("model", name="uq_ai_model_pricing_model"),
    )
    op.create_index(
        "ix_ai_model_pricing_model", "ai_model_pricing", ["model"], unique=True
    )

    op.create_table(
        "ai_usage_log",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("model", sa.String(length=100), nullable=False),
        sa.Column("purpose", sa.String(length=100), nullable=False),
        sa.Column(
            "clinic_id",
            sa.BigInteger(),
            sa.ForeignKey("clinic.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "doctor_id",
            sa.BigInteger(),
            sa.ForeignKey("doctor.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "admin_user_id",
            sa.BigInteger(),
            sa.ForeignKey("admin_user.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "submission_id",
            sa.BigInteger(),
            sa.ForeignKey("claim_submission.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("input_tokens", sa.Integer(), server_default="0", nullable=False),
        sa.Column("output_tokens", sa.Integer(), server_default="0", nullable=False),
        sa.Column("duration_ms", sa.Integer(), server_default="0", nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    for column in (
        "model",
        "purpose",
        "clinic_id",
        "doctor_id",
        "admin_user_id",
        "submission_id",
        "status",
        "created_at",
    ):
        op.create_index(f"ix_ai_usage_log_{column}", "ai_usage_log", [column])

    op.execute(
        """
        INSERT INTO ai_model_pricing
            (model, input_price_per_million, output_price_per_million)
        VALUES
            ('gemini-3.1-pro-preview', 2.00, 12.00),
            ('gemini-2.5-flash', 0.30, 2.50)
        """
    )

    # purpose 保留为维度，API 可直接展示环节细分，也可再次汇总为诊所/月/模型。
    op.execute(
        """
        CREATE VIEW ai_usage_monthly_by_clinic AS
        SELECT
            date_trunc('month', usage.created_at) AS usage_month,
            usage.clinic_id,
            usage.model,
            usage.purpose,
            COUNT(*) AS call_count,
            COALESCE(SUM(usage.input_tokens), 0)::bigint AS input_tokens,
            COALESCE(SUM(usage.output_tokens), 0)::bigint AS output_tokens,
            COALESCE(SUM(usage.input_tokens + usage.output_tokens), 0)::bigint
                AS total_tokens,
            (
                COALESCE(SUM(usage.input_tokens), 0)
                    * COALESCE(pricing.input_price_per_million, 0)
                + COALESCE(SUM(usage.output_tokens), 0)
                    * COALESCE(pricing.output_price_per_million, 0)
            ) / 1000000.0 AS estimated_cost_usd
        FROM ai_usage_log AS usage
        LEFT JOIN ai_model_pricing AS pricing ON pricing.model = usage.model
        GROUP BY
            date_trunc('month', usage.created_at),
            usage.clinic_id,
            usage.model,
            usage.purpose,
            pricing.input_price_per_million,
            pricing.output_price_per_million
        """
    )


def downgrade() -> None:
    op.execute("DROP VIEW IF EXISTS ai_usage_monthly_by_clinic")
    op.drop_table("ai_usage_log")
    op.drop_table("ai_model_pricing")
