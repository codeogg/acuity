"""drop clinic_onboarding — superseded by clinic_onboarding_step"""

from collections.abc import Sequence

from alembic import op

revision: str = "034_drop_clinic_onboarding"
down_revision: str | None = "033_onboarding_steps"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_table("clinic_onboarding")


def downgrade() -> None:
    import sqlalchemy as sa

    op.create_table(
        "clinic_onboarding",
        sa.Column(
            "clinic_id",
            sa.BigInteger(),
            sa.ForeignKey("clinic.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("next_step_zh", sa.String(length=200), nullable=False),
        sa.Column("next_step_en", sa.String(length=200), nullable=False),
        sa.Column("progress_step", sa.SmallInteger(), nullable=False),
        sa.Column(
            "progress_total",
            sa.SmallInteger(),
            nullable=False,
            server_default="8",
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("progress_step >= 0", name="ck_clinic_onboarding_step"),
        sa.CheckConstraint("progress_total > 0", name="ck_clinic_onboarding_total"),
    )
