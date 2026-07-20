"""管理员与操作日志模型。"""
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, SmallInteger, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from src.db.base import Base, TimestampMixin


class AdminUser(Base, TimestampMixin):
    __tablename__ = "admin_user"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    username: Mapped[str] = mapped_column(String(100), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    real_name: Mapped[str | None] = mapped_column(String(100))
    # SUPER_ADMIN/OPERATOR/ANNOTATOR
    role: Mapped[str] = mapped_column(String(20), default="OPERATOR")
    status: Mapped[int] = mapped_column(SmallInteger, default=1)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class OperationLog(Base):
    __tablename__ = "operation_log"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    operator_type: Mapped[str] = mapped_column(String(20))  # ADMIN/DOCTOR
    operator_id: Mapped[int] = mapped_column(BigInteger)
    operation_type: Mapped[str] = mapped_column(String(50))
    target_type: Mapped[str | None] = mapped_column(String(50))
    target_id: Mapped[int | None] = mapped_column(BigInteger)
    ip_address: Mapped[str | None] = mapped_column(String(50))
    request_detail: Mapped[dict | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
