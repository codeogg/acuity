"""确保诊所名称不重复"""
from collections.abc import Sequence

from alembic import op

revision: str = "015_unique_clinic_name"
down_revision: str | None = "014_add_ai_usage"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 保留最早记录；历史重复项附加诊所编码，避免删除任何关联数据。
    op.execute(
        """
        WITH ranked AS (
            SELECT
                id,
                row_number() OVER (
                    PARTITION BY lower(btrim(clinic_name))
                    ORDER BY id
                ) AS duplicate_no
            FROM clinic
        )
        UPDATE clinic AS target
        SET clinic_name = btrim(target.clinic_name) || '（' || target.clinic_code || '）'
        FROM ranked
        WHERE target.id = ranked.id
          AND ranked.duplicate_no > 1
        """
    )
    op.execute(
        """
        CREATE UNIQUE INDEX uq_clinic_name_normalized
        ON clinic ((lower(btrim(clinic_name))))
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_clinic_name_normalized")
