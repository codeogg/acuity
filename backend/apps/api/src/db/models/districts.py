"""地区字典（港島 / 九龍 / 新界下属区域）。"""
from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.db.base import Base, TimestampMixin

if TYPE_CHECKING:
    from src.db.models.org import Clinic


class District(Base, TimestampMixin):
    __tablename__ = "districts"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    name_zh: Mapped[str] = mapped_column(String(100), nullable=False)
    name_en: Mapped[str | None] = mapped_column(String(100))
    region: Mapped[str | None] = mapped_column(String(50))  # 港島 / 九龍 / 新界

    clinics: Mapped[list[Clinic]] = relationship(back_populates="district")
