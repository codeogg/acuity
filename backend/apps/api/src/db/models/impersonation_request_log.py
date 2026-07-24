"""模拟会话内逐请求审计流水（append-only）。"""
from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from src.db.base import Base


class ImpersonationRequestLog(Base):
    __tablename__ = "impersonation_request_logs"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)

    session_id: Mapped[int] = mapped_column(
        ForeignKey("impersonation_sessions.id"), index=True
    )
    operator_id: Mapped[int] = mapped_column(ForeignKey("admin_user.id"), index=True)
    doctor_id: Mapped[int] = mapped_column(ForeignKey("doctor.id"), index=True)
    clinic_id: Mapped[int] = mapped_column(ForeignKey("clinic.id"), index=True)
    mode: Mapped[str] = mapped_column(String(20))

    path: Mapped[str] = mapped_column(String(512))
    method: Mapped[str] = mapped_column(String(10))
    http_status: Mapped[int] = mapped_column(Integer)
    ip: Mapped[str | None] = mapped_column(String(64))
    latency_ms: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    access_level: Mapped[str] = mapped_column(String(20))
    decision: Mapped[str] = mapped_column(String(20))
    deny_code: Mapped[str | None] = mapped_column(String(50))

    sensitive: Mapped[bool] = mapped_column(Boolean, default=False)
    resource_type: Mapped[str | None] = mapped_column(String(100))
    resource_id: Mapped[str | None] = mapped_column(String(100))

    request_params: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    before_state: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    after_state: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    field_diff: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
