"""运营模拟会话：按 clinic+doctor 隔离的临时授权生命周期。"""
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    String,
    text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from src.db.base import Base


class ImpersonationSession(Base):
    __tablename__ = "impersonation_sessions"
    __table_args__ = (
        CheckConstraint("mode IN ('view', 'proxy')", name="ck_impersonation_sessions_mode"),
        CheckConstraint(
            "status IN ('active', 'ended', 'expired')",
            name="ck_impersonation_sessions_status",
        ),
        ForeignKeyConstraint(
            ["doctor_id", "clinic_id"],
            ["doctor_clinic_link.doctor_id", "doctor_clinic_link.clinic_id"],
            name="fk_impersonation_sessions_doctor_clinic_link",
        ),
        Index(
            "uq_impersonation_sessions_active_clinic_doctor",
            "clinic_id",
            "doctor_id",
            unique=True,
            postgresql_where=text("status = 'active'"),
        ),
        Index("idx_impersonation_sessions_operator_status", "operator_id", "status"),
        Index("idx_impersonation_sessions_doctor_status", "doctor_id", "status"),
        Index(
            "idx_impersonation_sessions_expire_active",
            "expire_at",
            postgresql_where=text("status = 'active'"),
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)

    clinic_id: Mapped[int] = mapped_column(ForeignKey("clinic.id"), index=True)
    doctor_id: Mapped[int] = mapped_column(ForeignKey("doctor.id"), index=True)
    operator_id: Mapped[int] = mapped_column(ForeignKey("admin_user.id"), index=True)

    # view = 检视只读；proxy = 代理可写
    mode: Mapped[str] = mapped_column(String(20))
    reason: Mapped[str | None] = mapped_column(String(255))
    # active | ended | expired
    status: Mapped[str] = mapped_column(
        String(20), default="active", server_default="active"
    )

    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    expire_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    last_active_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    doctor_notified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    doctor_acknowledged_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
