"""诊所订阅（与 clinic 1:1）。"""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    BigInteger,
    DateTime,
    ForeignKey,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.db.base import Base, TimestampMixin

if TYPE_CHECKING:
    from src.db.models.org import Clinic


class ClinicSubscription(Base, TimestampMixin):
    __tablename__ = "clinic_subscriptions"
    __table_args__ = (
        UniqueConstraint("clinic_id", name="uq_clinic_subscriptions_clinic_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    clinic_id: Mapped[int] = mapped_column(
        ForeignKey("clinic.id"), nullable=False, index=True
    )
    # trial / active / cancelled / expired
    subscription_status: Mapped[str] = mapped_column(String(20), default="trial")
    plan_code: Mapped[str | None] = mapped_column(String(50))
    price: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    currency: Mapped[str] = mapped_column(String(10), default="HKD")
    # unpaid / paid / overdue / refunded
    payment_status: Mapped[str | None] = mapped_column(String(20))
    # bank_transfer / credit_card / cheque / other
    payment_method: Mapped[str | None] = mapped_column(String(20))
    note_content: Mapped[str | None] = mapped_column(Text)
    # html / markdown
    note_format: Mapped[str] = mapped_column(String(20), default="markdown")
    note_updated_by: Mapped[int | None] = mapped_column(
        ForeignKey("admin_user.id"), nullable=True
    )
    note_updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    clinic: Mapped[Clinic] = relationship(back_populates="subscription")
