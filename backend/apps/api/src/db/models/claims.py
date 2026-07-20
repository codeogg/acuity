"""医生端填报业务模型。"""
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from src.db.base import Base, TimestampMixin


class ClaimSubmission(Base, TimestampMixin):
    __tablename__ = "claim_submission"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    submission_no: Mapped[str] = mapped_column(String(50), unique=True)
    clinic_id: Mapped[int] = mapped_column(ForeignKey("clinic.id"), index=True)
    doctor_id: Mapped[int] = mapped_column(ForeignKey("doctor.id"), index=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("insurance_company.id"))
    template_id: Mapped[int] = mapped_column(ForeignKey("policy_template.id"))
    template_version: Mapped[str | None] = mapped_column(String(20))
    patient_name: Mapped[str | None] = mapped_column(String(100))
    # 存储前应用层加密（core.encryption）
    medical_record_text: Mapped[str | None] = mapped_column(Text)
    ai_raw_result: Mapped[dict | None] = mapped_column(JSONB)
    final_field_values: Mapped[dict | None] = mapped_column(JSONB)
    # The review UI keeps this separately from values: a value can exist but
    # still require the doctor's explicit confirmation before sign-off.
    field_confirmations: Mapped[dict | None] = mapped_column(JSONB)
    # Cursor used by PUT /claims/{id}/fields to reject stale review saves.
    row_version: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    ai_token_usage: Mapped[int | None] = mapped_column(Integer)
    generated_pdf_url: Mapped[str | None] = mapped_column(String(255))
    # DRAFT/AI_FILLED/CONFIRMED/PRINTED/CANCELLED
    status: Mapped[str] = mapped_column(String(20), default="DRAFT", index=True)
    ai_process_time_ms: Mapped[int | None] = mapped_column(Integer)
    extraction_task_id: Mapped[int | None] = mapped_column(
        ForeignKey("extraction_task.id", ondelete="SET NULL"), index=True
    )
    extract_status: Mapped[str] = mapped_column(String(30), default="IDLE")
    extract_stage: Mapped[str | None] = mapped_column(String(30))
    extract_progress: Mapped[int] = mapped_column(Integer, default=0)
    extract_message: Mapped[str | None] = mapped_column(String(255))
    extract_job_id: Mapped[str | None] = mapped_column(String(100))
    extract_manifest: Mapped[dict | None] = mapped_column(JSONB)


class ClaimFieldChangeLog(Base):
    __tablename__ = "claim_field_change_log"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    submission_id: Mapped[int] = mapped_column(
        ForeignKey("claim_submission.id", ondelete="CASCADE"), index=True
    )
    standard_field_id: Mapped[int] = mapped_column(
        ForeignKey("standard_field.id"), index=True
    )
    ai_original_value: Mapped[str | None] = mapped_column(Text)
    final_value: Mapped[str | None] = mapped_column(Text)
    is_modified: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
