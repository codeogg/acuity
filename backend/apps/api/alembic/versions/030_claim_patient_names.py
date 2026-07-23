"""Add claim_submission.patient_name_cn / patient_name_en."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "030_claim_patient_names"
down_revision: str | None = "029_clinic_lifecycle"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "claim_submission",
        sa.Column("patient_name_cn", sa.String(length=100), nullable=True),
    )
    op.add_column(
        "claim_submission",
        sa.Column("patient_name_en", sa.String(length=100), nullable=True),
    )
    # Preserve existing display name: prefer as Chinese unless it is clearly Latin-only.
    op.execute(
        """
        UPDATE claim_submission
        SET
          patient_name_cn = CASE
            WHEN patient_name IS NULL OR btrim(patient_name) = '' THEN NULL
            WHEN patient_name ~ '[\\u4e00-\\u9fff]' THEN patient_name
            ELSE patient_name_cn
          END,
          patient_name_en = CASE
            WHEN patient_name IS NULL OR btrim(patient_name) = '' THEN NULL
            WHEN patient_name ~ '[\\u4e00-\\u9fff]' THEN patient_name_en
            ELSE patient_name
          END
        WHERE patient_name IS NOT NULL
        """
    )


def downgrade() -> None:
    op.drop_column("claim_submission", "patient_name_en")
    op.drop_column("claim_submission", "patient_name_cn")
