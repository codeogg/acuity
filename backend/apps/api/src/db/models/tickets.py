"""运营工单。"""
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    DateTime,
    ForeignKey,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.db.base import Base, TimestampMixin


class OpsTicket(Base, TimestampMixin):
    __tablename__ = "ops_ticket"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    ticket_no: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    clinic_id: Mapped[int] = mapped_column(ForeignKey("clinic.id"), index=True)
    subject_zh: Mapped[str] = mapped_column(String(200))
    subject_en: Mapped[str] = mapped_column(String(200))
    # open | in-progress | resolved
    status: Mapped[str] = mapped_column(String(20), default="open", index=True)
    # Display name for API owner field (matches console contract).
    owner: Mapped[str | None] = mapped_column(String(100))
    owner_admin_id: Mapped[int | None] = mapped_column(
        ForeignKey("admin_user.id"), nullable=True
    )
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolved_by: Mapped[int | None] = mapped_column(
        ForeignKey("admin_user.id"), nullable=True
    )

    notes: Mapped[list["OpsTicketNote"]] = relationship(
        back_populates="ticket",
        cascade="all, delete-orphan",
        order_by="OpsTicketNote.created_at",
    )


class OpsTicketNote(Base):
    __tablename__ = "ops_ticket_note"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    ticket_id: Mapped[int] = mapped_column(
        ForeignKey("ops_ticket.id", ondelete="CASCADE"), index=True
    )
    body: Mapped[str] = mapped_column(Text)
    # comment | resolution
    note_kind: Mapped[str] = mapped_column(String(20), default="comment")
    created_by: Mapped[int | None] = mapped_column(
        ForeignKey("admin_user.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    ticket: Mapped[OpsTicket] = relationship(back_populates="notes")
