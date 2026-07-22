"""Add clinic.lifecycle_status (provisioning → onboarding → active)."""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "029_clinic_lifecycle"
down_revision: str | None = "028_doctor_mfa"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "clinic",
        sa.Column(
            "lifecycle_status",
            sa.String(20),
            nullable=False,
            server_default="provisioning",
        ),
    )
    # Backfill: clinics that already finished the provisioning checklist
    # advance to onboarding. Active is reserved for completed import (later).
    op.execute(
        """
        UPDATE clinic AS c
        SET lifecycle_status = 'onboarding'
        WHERE c.lifecycle_status = 'provisioning'
          AND COALESCE(TRIM(c.clinic_name), '') <> ''
          AND COALESCE(TRIM(c.address), '') <> ''
          AND COALESCE(TRIM(c.data_region), '') <> ''
          AND EXISTS (
            SELECT 1 FROM doctor_clinic_link dcl
            WHERE dcl.clinic_id = c.id
          )
          AND EXISTS (
            SELECT 1 FROM clinic_insurance_company cic
            WHERE cic.clinic_id = c.id AND cic.status = 1
          )
        """
    )


def downgrade() -> None:
    op.drop_column("clinic", "lifecycle_status")
