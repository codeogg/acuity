"""Unified operator audit trail (append-only)."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import BigInteger, DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from src.db.base import Base


class AuditLog(Base):
    """Global append-only audit log. Never update or delete rows."""

    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    event_code: Mapped[str] = mapped_column(String(32), unique=True, nullable=False, index=True)
    action_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    operator_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("admin_user.id"), nullable=False, index=True
    )
    clinic_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("clinic.id"), nullable=True, index=True
    )
    target_ref: Mapped[str | None] = mapped_column(String(255), nullable=True)
    mode: Mapped[str | None] = mapped_column(String(20), nullable=True)  # view-as | act-as | null
    field_set: Mapped[str | None] = mapped_column(String(255), nullable=True)
    detail: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
