"""onboarding_step_template + clinic_onboarding_step — 导览步骤追踪"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "033_onboarding_steps"
down_revision: str | None = "032_ops_tickets"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_STEPS = [
    ("confirm_setup", "確認設定", "Confirm setup", 1),
    ("import_record", "匯入真實病歷", "Import a real record", 2),
    ("extraction", "AI 擷取", "Extraction", 3),
    ("review_draft", "與醫生覆核草稿", "Review draft with doctor", 4),
    ("sign", "簽署", "Sign", 5),
    ("produce_pdf", "產出正式 PDF", "Produce real PDF", 6),
    ("capture_feedback", "收集回饋", "Capture feedback", 7),
    ("confirm_unaided", "確認診所可獨立運作", "Confirm clinic can run unaided", 8),
]


def upgrade() -> None:
    op.create_table(
        "onboarding_step_template",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("step_code", sa.String(length=50), nullable=False),
        sa.Column("step_name", sa.String(length=200), nullable=False),
        sa.Column("step_name_en", sa.String(length=200), nullable=False),
        sa.Column("sort_order", sa.SmallInteger(), nullable=False),
        sa.UniqueConstraint("step_code", name="uq_onboarding_step_template_code"),
        sa.UniqueConstraint("sort_order", name="uq_onboarding_step_template_order"),
    )

    op.create_table(
        "clinic_onboarding_step",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column(
            "clinic_id",
            sa.BigInteger(),
            sa.ForeignKey("clinic.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("step_code", sa.String(length=50), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="pending"),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "completed_by",
            sa.BigInteger(),
            sa.ForeignKey("admin_user.id"),
            nullable=True,
        ),
        sa.UniqueConstraint(
            "clinic_id", "step_code", name="uq_clinic_onboarding_step_clinic_code"
        ),
        sa.CheckConstraint(
            "status IN ('pending', 'completed')",
            name="ck_clinic_onboarding_step_status",
        ),
        sa.ForeignKeyConstraint(
            ["step_code"],
            ["onboarding_step_template.step_code"],
            name="fk_clinic_onboarding_step_code",
        ),
    )
    op.create_index(
        "idx_clinic_onboarding_step_clinic_status",
        "clinic_onboarding_step",
        ["clinic_id", "status"],
    )

    for code, name_zh, name_en, order in _STEPS:
        op.execute(
            sa.text(
                """
                INSERT INTO onboarding_step_template
                  (step_code, step_name, step_name_en, sort_order)
                VALUES (:code, :name_zh, :name_en, :ord)
                """
            ).bindparams(code=code, name_zh=name_zh, name_en=name_en, ord=order)
        )

    # Backfill steps for clinics already in onboarding.
    op.execute(
        sa.text(
            """
            INSERT INTO clinic_onboarding_step (clinic_id, step_code, status)
            SELECT c.id, t.step_code, 'pending'
            FROM clinic c
            CROSS JOIN onboarding_step_template t
            WHERE c.lifecycle_status = 'onboarding'
            ON CONFLICT (clinic_id, step_code) DO NOTHING
            """
        )
    )


def downgrade() -> None:
    op.drop_index(
        "idx_clinic_onboarding_step_clinic_status",
        table_name="clinic_onboarding_step",
    )
    op.drop_table("clinic_onboarding_step")
    op.drop_table("onboarding_step_template")
