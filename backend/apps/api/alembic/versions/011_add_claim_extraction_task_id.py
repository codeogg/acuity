"""claim_submission 关联 extraction_task"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "011_claim_extraction_task"
down_revision: Union[str, None] = "010_extraction_review_output"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "claim_submission",
        sa.Column("extraction_task_id", sa.BigInteger(), nullable=True),
    )
    op.create_foreign_key(
        "fk_claim_extraction_task",
        "claim_submission",
        "extraction_task",
        ["extraction_task_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "idx_claim_extraction_task",
        "claim_submission",
        ["extraction_task_id"],
    )


def downgrade() -> None:
    op.drop_index("idx_claim_extraction_task", table_name="claim_submission")
    op.drop_constraint("fk_claim_extraction_task", "claim_submission", type_="foreignkey")
    op.drop_column("claim_submission", "extraction_task_id")
