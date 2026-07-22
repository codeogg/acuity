"""Data retention: global default policy + per-clinic override."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    BigInteger,
    DateTime,
    ForeignKey,
    Integer,
    SmallInteger,
    String,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from src.db.base import Base


class RetentionPolicy(Base):
    """Global retention policy catalogue. Exactly one row should be is_default=1."""

    __tablename__ = "retention_policies"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    policy_name: Mapped[str] = mapped_column(String(100), nullable=False)
    retention_days: Mapped[int] = mapped_column(Integer, nullable=False)
    is_default: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class ClinicDataRetention(Base):
    """1:1 clinic override. Missing row / is_overridden=0 → use global default."""

    __tablename__ = "clinic_data_retention"

    clinic_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("clinic.id"), primary_key=True
    )
    is_overridden: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    retention_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    overridden_by: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("admin_user.id"), nullable=True
    )
    overridden_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
