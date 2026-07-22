"""Doctor specialty (form_tag FK) + rich-text notes format."""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "027_doctor_specialty_notes"
down_revision: str | None = "026_audit_logs"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "doctor",
        sa.Column("specialty_tag_id", sa.BigInteger(), nullable=True),
    )
    op.add_column(
        "doctor",
        sa.Column(
            "account_notes_format",
            sa.String(length=20),
            nullable=False,
            server_default="markdown",
        ),
    )
    op.create_foreign_key(
        "fk_doctor_specialty_tag_id",
        "doctor",
        "form_tag",
        ["specialty_tag_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_index("ix_doctor_specialty_tag_id", "doctor", ["specialty_tag_id"])

    op.execute(
        sa.text(
            """
            UPDATE doctor
            SET specialty_tag_id = (
                SELECT id FROM form_tag
                WHERE kind = 'specialty' AND label_en = 'General practice'
                ORDER BY id
                LIMIT 1
            )
            WHERE specialty_tag_id IS NULL
            """
        )
    )
    op.alter_column("doctor", "specialty_tag_id", nullable=False)


def downgrade() -> None:
    op.drop_index("ix_doctor_specialty_tag_id", table_name="doctor")
    op.drop_constraint("fk_doctor_specialty_tag_id", "doctor", type_="foreignkey")
    op.drop_column("doctor", "account_notes_format")
    op.drop_column("doctor", "specialty_tag_id")
