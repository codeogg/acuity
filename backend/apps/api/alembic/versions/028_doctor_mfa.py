"""Doctor TOTP MFA fields + backup recovery codes."""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "028_doctor_mfa"
down_revision: str | None = "027_doctor_specialty_notes"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "doctor",
        sa.Column("mfa_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "doctor",
        sa.Column("mfa_secret", sa.Text(), nullable=True),
    )
    op.add_column(
        "doctor",
        sa.Column("mfa_enrolled_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "doctor",
        sa.Column(
            "failed_mfa_attempts",
            sa.SmallInteger(),
            nullable=False,
            server_default="0",
        ),
    )
    op.add_column(
        "doctor",
        sa.Column("account_locked", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "doctor",
        sa.Column(
            "registration_status",
            sa.String(length=20),
            nullable=False,
            server_default="registered",
        ),
    )

    op.create_table(
        "doctor_mfa_backup_code",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("doctor_id", sa.BigInteger(), sa.ForeignKey("doctor.id"), nullable=False),
        sa.Column("code_hash", sa.String(length=255), nullable=False),
        sa.Column("is_used", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_doctor_mfa_backup_code_doctor_id",
        "doctor_mfa_backup_code",
        ["doctor_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_doctor_mfa_backup_code_doctor_id", table_name="doctor_mfa_backup_code")
    op.drop_table("doctor_mfa_backup_code")
    op.drop_column("doctor", "registration_status")
    op.drop_column("doctor", "account_locked")
    op.drop_column("doctor", "failed_mfa_attempts")
    op.drop_column("doctor", "mfa_enrolled_at")
    op.drop_column("doctor", "mfa_secret")
    op.drop_column("doctor", "mfa_enabled")
