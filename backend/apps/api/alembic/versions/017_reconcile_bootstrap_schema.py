"""reconcile bootstrap SQL with historical migrations

Early local environments were created with db/init.sql then stamped at head.
That skipped a few additive historical migrations.  This idempotent repair
brings those databases to the schema expected by the current ORM without
replaying table-creation migrations over existing data.
"""
from collections.abc import Sequence

from alembic import op

revision: str = "017_reconcile_bootstrap_schema"
down_revision: str | None = "016_add_claim_review_state"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE policy_template ADD COLUMN IF NOT EXISTS parse_progress SMALLINT NOT NULL DEFAULT 0"
    )
    op.execute(
        "ALTER TABLE policy_template ADD COLUMN IF NOT EXISTS parse_message VARCHAR(255)"
    )
    op.execute(
        "ALTER TABLE policy_template ADD COLUMN IF NOT EXISTS parse_job_id VARCHAR(64)"
    )
    op.execute(
        "ALTER TABLE template_field_mapping ADD COLUMN IF NOT EXISTS template_specific_field_code VARCHAR(100)"
    )
    op.execute(
        "ALTER TABLE template_field_mapping ADD COLUMN IF NOT EXISTS template_specific_ai_hint TEXT"
    )
    op.execute("ALTER TABLE template_field_mapping DROP CONSTRAINT IF EXISTS template_field_mapping_check")
    op.execute("ALTER TABLE template_field_mapping DROP CONSTRAINT IF EXISTS ck_mapping_source")
    op.execute(
        """
        ALTER TABLE template_field_mapping
        ADD CONSTRAINT ck_mapping_source CHECK (
            standard_field_id IS NOT NULL
            OR fixed_value IS NOT NULL
            OR (template_specific_field_code IS NOT NULL AND template_specific_ai_hint IS NOT NULL)
        )
        """
    )


def downgrade() -> None:
    op.execute("ALTER TABLE template_field_mapping DROP CONSTRAINT IF EXISTS ck_mapping_source")
    op.execute(
        """
        ALTER TABLE template_field_mapping
        ADD CONSTRAINT template_field_mapping_check CHECK (
            standard_field_id IS NOT NULL OR fixed_value IS NOT NULL
        )
        """
    )
    op.execute("ALTER TABLE template_field_mapping DROP COLUMN IF EXISTS template_specific_ai_hint")
    op.execute("ALTER TABLE template_field_mapping DROP COLUMN IF EXISTS template_specific_field_code")
    op.execute("ALTER TABLE policy_template DROP COLUMN IF EXISTS parse_job_id")
    op.execute("ALTER TABLE policy_template DROP COLUMN IF EXISTS parse_message")
    op.execute("ALTER TABLE policy_template DROP COLUMN IF EXISTS parse_progress")
