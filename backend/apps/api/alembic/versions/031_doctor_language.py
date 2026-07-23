"""doctor.language — 预设界面语言（zh-Hant-HK / en-HK）"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "031_doctor_language"
down_revision: str | None = "030_claim_patient_names"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "doctor",
        sa.Column(
            "language",
            sa.String(length=20),
            nullable=False,
            server_default="zh-Hant-HK",
        ),
    )
    op.execute(
        """
        COMMENT ON COLUMN doctor.language IS
        '医生预设界面语言（zh-Hant-HK / en-HK）'
        """
    )


def downgrade() -> None:
    op.drop_column("doctor", "language")
