"""AI 调用用量与模型定价。"""
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from src.db.base import Base


class AiUsageLog(Base):
    """一次真实 AI 请求对应一条记录。"""

    __tablename__ = "ai_usage_log"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    model: Mapped[str] = mapped_column(String(100), index=True)
    purpose: Mapped[str] = mapped_column(String(100), index=True)
    clinic_id: Mapped[int | None] = mapped_column(
        ForeignKey("clinic.id", ondelete="SET NULL"), index=True
    )
    doctor_id: Mapped[int | None] = mapped_column(
        ForeignKey("doctor.id", ondelete="SET NULL"), index=True
    )
    admin_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("admin_user.id", ondelete="SET NULL"), index=True
    )
    submission_id: Mapped[int | None] = mapped_column(
        ForeignKey("claim_submission.id", ondelete="SET NULL"), index=True
    )
    input_tokens: Mapped[int] = mapped_column(Integer, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, default=0)
    duration_ms: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(20), index=True)
    error_message: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )


class AiModelPricing(Base):
    """每百万 token 的美元单价。"""

    __tablename__ = "ai_model_pricing"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    model: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    input_price_per_million: Mapped[Decimal] = mapped_column(Numeric(12, 4))
    output_price_per_million: Mapped[Decimal] = mapped_column(Numeric(12, 4))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
