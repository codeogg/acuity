"""ops_ticket / ops_ticket_note / clinic_onboarding — 运营工单与开通队列"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "032_ops_tickets"
down_revision: str | None = "031_doctor_language"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(sa.text("CREATE SEQUENCE IF NOT EXISTS ops_ticket_no_seq START WITH 1100"))

    op.create_table(
        "ops_ticket",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("ticket_no", sa.String(length=32), nullable=False),
        sa.Column(
            "clinic_id",
            sa.BigInteger(),
            sa.ForeignKey("clinic.id"),
            nullable=False,
        ),
        sa.Column("subject_zh", sa.String(length=200), nullable=False),
        sa.Column("subject_en", sa.String(length=200), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="open"),
        sa.Column("owner", sa.String(length=100), nullable=True),
        sa.Column(
            "owner_admin_id",
            sa.BigInteger(),
            sa.ForeignKey("admin_user.id"),
            nullable=True,
        ),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "resolved_by",
            sa.BigInteger(),
            sa.ForeignKey("admin_user.id"),
            nullable=True,
        ),
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
        sa.UniqueConstraint("ticket_no", name="uq_ops_ticket_ticket_no"),
        sa.CheckConstraint(
            "status IN ('open', 'in-progress', 'resolved')",
            name="ck_ops_ticket_status",
        ),
    )
    op.create_index("idx_ops_ticket_status_updated", "ops_ticket", ["status", "updated_at"])
    op.create_index("idx_ops_ticket_owner_status", "ops_ticket", ["owner", "status"])
    op.create_index("idx_ops_ticket_clinic", "ops_ticket", ["clinic_id"])

    op.create_table(
        "ops_ticket_note",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column(
            "ticket_id",
            sa.BigInteger(),
            sa.ForeignKey("ops_ticket.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("note_kind", sa.String(length=20), nullable=False, server_default="comment"),
        sa.Column(
            "created_by",
            sa.BigInteger(),
            sa.ForeignKey("admin_user.id"),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "note_kind IN ('comment', 'resolution')",
            name="ck_ops_ticket_note_kind",
        ),
    )
    op.create_index(
        "idx_ops_ticket_note_ticket",
        "ops_ticket_note",
        ["ticket_id", "created_at"],
    )

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
        sa.Column("progress_total", sa.SmallInteger(), nullable=False, server_default="8"),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("progress_step >= 0", name="ck_clinic_onboarding_step"),
        sa.CheckConstraint("progress_total > 0", name="ck_clinic_onboarding_total"),
    )

    # Seed onboarding rows for clinics still in provisioning/onboarding.
    op.execute(
        sa.text(
            """
            INSERT INTO clinic_onboarding (
              clinic_id, next_step_zh, next_step_en, progress_step, progress_total, updated_at
            )
            SELECT
              c.id,
              CASE c.lifecycle_status
                WHEN 'provisioning' THEN '確認診所基本資料'
                ELSE '建立醫生帳戶'
              END,
              CASE c.lifecycle_status
                WHEN 'provisioning' THEN 'Confirm clinic profile'
                ELSE 'Create doctor accounts'
              END,
              CASE c.lifecycle_status
                WHEN 'provisioning' THEN 1
                ELSE 4
              END,
              8,
              COALESCE(c.updated_at, NOW())
            FROM clinic c
            WHERE c.lifecycle_status IN ('provisioning', 'onboarding')
            ON CONFLICT (clinic_id) DO NOTHING
            """
        )
    )

    # Seed a few demo tickets for the oldest non-active clinics (if any).
    op.execute(
        sa.text(
            """
            WITH targets AS (
              SELECT id AS clinic_id
              FROM clinic
              WHERE lifecycle_status IN ('provisioning', 'onboarding')
              ORDER BY id
              LIMIT 3
            ),
            numbered AS (
              SELECT clinic_id, ROW_NUMBER() OVER (ORDER BY clinic_id) AS n
              FROM targets
            )
            INSERT INTO ops_ticket (
              ticket_no, clinic_id, subject_zh, subject_en, status, owner, updated_at
            )
            SELECT
              'TK-' || (1100 + n)::text,
              clinic_id,
              CASE n
                WHEN 1 THEN '新診所開通進度查詢'
                WHEN 2 THEN '帳戶啟用前設定'
                ELSE '簽名圖片上載失敗'
              END,
              CASE n
                WHEN 1 THEN 'Provisioning progress enquiry'
                WHEN 2 THEN 'Pre-activation setup'
                ELSE 'Signature image upload failing'
              END,
              CASE n
                WHEN 2 THEN 'in-progress'
                ELSE 'open'
              END,
              CASE n
                WHEN 1 THEN 'M. Cheng'
                WHEN 2 THEN 'A. Founder'
                ELSE NULL
              END,
              NOW() - ((n - 1) * INTERVAL '1 day')
            FROM numbered
            """
        )
    )


def downgrade() -> None:
    op.drop_table("clinic_onboarding")
    op.drop_table("ops_ticket_note")
    op.drop_index("idx_ops_ticket_clinic", table_name="ops_ticket")
    op.drop_index("idx_ops_ticket_owner_status", table_name="ops_ticket")
    op.drop_index("idx_ops_ticket_status_updated", table_name="ops_ticket")
    op.drop_table("ops_ticket")
    op.execute(sa.text("DROP SEQUENCE IF EXISTS ops_ticket_no_seq"))
