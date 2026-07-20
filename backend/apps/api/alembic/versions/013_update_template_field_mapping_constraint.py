"""更新 template_field_mapping 约束以支持模板专属AI提取"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "013_template_mapping_ck"
down_revision: Union[str, None] = "012_claim_extract_progress"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_column(table_name: str, column_name: str) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = inspector.get_columns(table_name)
    return any(column["name"] == column_name for column in columns)


def upgrade() -> None:
    if not _has_column("template_field_mapping", "template_specific_field_code"):
        op.add_column(
            "template_field_mapping",
            sa.Column("template_specific_field_code", sa.String(length=100), nullable=True),
        )
    if not _has_column("template_field_mapping", "template_specific_ai_hint"):
        op.add_column(
            "template_field_mapping",
            sa.Column("template_specific_ai_hint", sa.Text(), nullable=True),
        )

    op.execute(
        """
        ALTER TABLE template_field_mapping
        DROP CONSTRAINT IF EXISTS template_field_mapping_check
        """
    )
    op.execute(
        """
        ALTER TABLE template_field_mapping
        DROP CONSTRAINT IF EXISTS ck_mapping_source
        """
    )
    op.create_check_constraint(
        "ck_mapping_source",
        "template_field_mapping",
        "standard_field_id IS NOT NULL OR fixed_value IS NOT NULL OR "
        "(template_specific_field_code IS NOT NULL AND template_specific_ai_hint IS NOT NULL)",
    )


def downgrade() -> None:
    op.execute(
        """
        ALTER TABLE template_field_mapping
        DROP CONSTRAINT IF EXISTS ck_mapping_source
        """
    )
    op.create_check_constraint(
        "template_field_mapping_check",
        "template_field_mapping",
        "standard_field_id IS NOT NULL OR fixed_value IS NOT NULL",
    )

    if _has_column("template_field_mapping", "template_specific_ai_hint"):
        op.drop_column("template_field_mapping", "template_specific_ai_hint")
    if _has_column("template_field_mapping", "template_specific_field_code"):
        op.drop_column("template_field_mapping", "template_specific_field_code")
