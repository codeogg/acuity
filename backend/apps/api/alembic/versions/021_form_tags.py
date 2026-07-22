"""form_tag + tag_visibility — Forms library taxonomy and doctor visibility."""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "021_form_tags"
down_revision: str | None = "020_add_doctor_email"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "form_tag",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column("label_zh", sa.String(length=100), nullable=False),
        sa.Column("label_en", sa.String(length=100), nullable=False),
        sa.Column("parent_id", sa.BigInteger(), sa.ForeignKey("form_tag.id"), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("retired", sa.Boolean(), nullable=False, server_default=sa.text("false")),
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
    )
    op.create_index("ix_form_tag_kind", "form_tag", ["kind"])
    op.create_index("ix_form_tag_parent_id", "form_tag", ["parent_id"])
    op.create_index("ix_form_tag_retired", "form_tag", ["retired"])

    op.create_table(
        "tag_visibility",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("doctor_id", sa.BigInteger(), sa.ForeignKey("doctor.id"), nullable=False),
        sa.Column("tag_id", sa.BigInteger(), sa.ForeignKey("form_tag.id"), nullable=False),
        sa.Column("visible", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.UniqueConstraint("doctor_id", "tag_id", name="uq_tag_visibility_doctor_tag"),
    )
    op.create_index("ix_tag_visibility_doctor_id", "tag_visibility", ["doctor_id"])
    op.create_index("ix_tag_visibility_tag_id", "tag_visibility", ["tag_id"])


def downgrade() -> None:
    op.drop_index("ix_tag_visibility_tag_id", table_name="tag_visibility")
    op.drop_index("ix_tag_visibility_doctor_id", table_name="tag_visibility")
    op.drop_table("tag_visibility")
    op.drop_index("ix_form_tag_retired", table_name="form_tag")
    op.drop_index("ix_form_tag_parent_id", table_name="form_tag")
    op.drop_index("ix_form_tag_kind", table_name="form_tag")
    op.drop_table("form_tag")
