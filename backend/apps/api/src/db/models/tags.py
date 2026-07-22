"""表格分类标签（type / insurer / specialty）及医生可见性。"""
from sqlalchemy import (
    BigInteger,
    Boolean,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from src.db.base import Base, TimestampMixin


class FormTag(Base, TimestampMixin):
    """Forms library taxonomy node (前端 Tag 契约)。"""

    __tablename__ = "form_tag"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    kind: Mapped[str] = mapped_column(String(20), index=True)  # type|insurer|specialty
    label_zh: Mapped[str] = mapped_column(String(100))
    label_en: Mapped[str] = mapped_column(String(100))
    parent_id: Mapped[int | None] = mapped_column(
        ForeignKey("form_tag.id"), nullable=True, index=True
    )
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    retired: Mapped[bool] = mapped_column(Boolean, default=False, index=True)


class TagVisibility(Base):
    """Per-doctor visibility override for a taxonomy tag."""

    __tablename__ = "tag_visibility"
    __table_args__ = (
        UniqueConstraint("doctor_id", "tag_id", name="uq_tag_visibility_doctor_tag"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    doctor_id: Mapped[int] = mapped_column(ForeignKey("doctor.id"), index=True)
    tag_id: Mapped[int] = mapped_column(ForeignKey("form_tag.id"), index=True)
    visible: Mapped[bool] = mapped_column(Boolean, default=True)
