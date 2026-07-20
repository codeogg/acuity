"""病历 PDF 智能提取任务模型。"""
from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.db.base import Base, TimestampMixin


class ExtractionTask(Base, TimestampMixin):
    """PDF 提取流水线任务（Step1 创建，后续步骤更新状态）。"""

    __tablename__ = "extraction_task"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    task_no: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    clinic_id: Mapped[int] = mapped_column(ForeignKey("clinic.id"), index=True)
    doctor_id: Mapped[int] = mapped_column(ForeignKey("doctor.id"), index=True)
    patient_name: Mapped[str | None] = mapped_column(String(100))
    original_filename: Mapped[str] = mapped_column(String(255))
    pdf_url: Mapped[str] = mapped_column(String(512))
    file_size_bytes: Mapped[int] = mapped_column(Integer)
    # WAITING / PREPROCESSING / OCR / CLASSIFYING / ... / COMPLETED / FAILED
    status: Mapped[str] = mapped_column(String(30), default="WAITING", index=True)
    current_step: Mapped[str | None] = mapped_column(String(30))
    error_message: Mapped[str | None] = mapped_column(Text)

    pages: Mapped[list["DocumentPage"]] = relationship(
        back_populates="task", cascade="all, delete-orphan"
    )
    ocr_results: Mapped[list["OcrResult"]] = relationship(
        back_populates="task", cascade="all, delete-orphan"
    )
    classification: Mapped["DocumentClassification | None"] = relationship(
        back_populates="task", cascade="all, delete-orphan", uselist=False
    )
    visits: Mapped[list["ExtractionVisit"]] = relationship(
        back_populates="task", cascade="all, delete-orphan"
    )
    prompt: Mapped["ExtractionPrompt | None"] = relationship(
        back_populates="task", cascade="all, delete-orphan", uselist=False
    )
    extraction_result: Mapped["ExtractionResult | None"] = relationship(
        back_populates="task", cascade="all, delete-orphan", uselist=False
    )
    mapped_result: Mapped["ExtractionMappedResult | None"] = relationship(
        back_populates="task", cascade="all, delete-orphan", uselist=False
    )
    review_output: Mapped["ExtractionReviewOutput | None"] = relationship(
        back_populates="task", cascade="all, delete-orphan", uselist=False
    )


class ExtractionReviewOutput(Base, TimestampMixin):
    """Step11 输出：标准 JSON + 人工审核结果。"""

    __tablename__ = "extraction_review_output"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    task_id: Mapped[int] = mapped_column(
        ForeignKey("extraction_task.id", ondelete="CASCADE"), unique=True, index=True
    )
    insurance_company: Mapped[str | None] = mapped_column(String(100))
    standard_fields: Mapped[dict] = mapped_column(JSONB)
    edited_fields: Mapped[dict | None] = mapped_column(JSONB)
    mapped_fields: Mapped[dict | None] = mapped_column(JSONB)
    is_confirmed: Mapped[bool] = mapped_column(Boolean, default=False)
    reviewed_by_id: Mapped[int | None] = mapped_column(ForeignKey("doctor.id"))
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    task: Mapped["ExtractionTask"] = relationship(back_populates="review_output")


class DocumentPage(Base, TimestampMixin):
    """Step2 输出：每页文本层或扫描图路径。"""

    __tablename__ = "document_page"
    __table_args__ = (UniqueConstraint("task_id", "page_no", name="uq_document_page_task_page"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    task_id: Mapped[int] = mapped_column(
        ForeignKey("extraction_task.id", ondelete="CASCADE"), index=True
    )
    page_no: Mapped[int] = mapped_column(Integer)
    # text_layer / ocr_required
    source: Mapped[str] = mapped_column(String(20))
    text: Mapped[str | None] = mapped_column(Text)
    image_path: Mapped[str | None] = mapped_column(String(512))

    task: Mapped["ExtractionTask"] = relationship(back_populates="pages")


class OcrResult(Base, TimestampMixin):
    """Step3 输出：每页 OCR blocks（含 bbox / confidence）。"""

    __tablename__ = "ocr_result"
    __table_args__ = (UniqueConstraint("task_id", "page_no", name="uq_ocr_result_task_page"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    task_id: Mapped[int] = mapped_column(
        ForeignKey("extraction_task.id", ondelete="CASCADE"), index=True
    )
    page_no: Mapped[int] = mapped_column(Integer)
    blocks: Mapped[list] = mapped_column(JSONB)

    task: Mapped["ExtractionTask"] = relationship(back_populates="ocr_results")


class DocumentClassification(Base, TimestampMixin):
    """Step4 输出：文档级分类结果。"""

    __tablename__ = "document_classification"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    task_id: Mapped[int] = mapped_column(
        ForeignKey("extraction_task.id", ondelete="CASCADE"), unique=True, index=True
    )
    document_type: Mapped[str] = mapped_column(String(80))
    language: Mapped[str] = mapped_column(String(20))
    multiple_patient: Mapped[bool] = mapped_column(Boolean)
    multiple_visit: Mapped[bool] = mapped_column(Boolean)
    insurance_company: Mapped[str | None] = mapped_column(String(100))
    need_visit_selector: Mapped[bool] = mapped_column(Boolean)
    source_text_chars: Mapped[int] = mapped_column(Integer, default=0)
    source_pages_used: Mapped[int] = mapped_column(Integer, default=0)
    model_name: Mapped[str | None] = mapped_column(String(100))
    token_usage: Mapped[int] = mapped_column(Integer, default=0)
    stub: Mapped[bool] = mapped_column(Boolean, default=False)

    task: Mapped["ExtractionTask"] = relationship(back_populates="classification")


class ExtractionVisit(Base, TimestampMixin):
    """Step5 输出：候选就诊记录 + 用户选择标记。"""

    __tablename__ = "extraction_visit"
    __table_args__ = (
        UniqueConstraint("task_id", "visit_index", name="uq_extraction_visit_task_index"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    task_id: Mapped[int] = mapped_column(
        ForeignKey("extraction_task.id", ondelete="CASCADE"), index=True
    )
    visit_index: Mapped[int] = mapped_column(Integer)
    visit_date: Mapped[str | None] = mapped_column(String(20))
    summary: Mapped[str | None] = mapped_column(Text)
    page_start: Mapped[int] = mapped_column(Integer)
    page_end: Mapped[int] = mapped_column(Integer)
    selected: Mapped[bool] = mapped_column(Boolean, default=False)
    model_name: Mapped[str | None] = mapped_column(String(100))
    token_usage: Mapped[int] = mapped_column(Integer, default=0)
    stub: Mapped[bool] = mapped_column(Boolean, default=False)

    task: Mapped["ExtractionTask"] = relationship(back_populates="visits")


class ExtractionPrompt(Base, TimestampMixin):
    """Step6 输出：字段提取 Prompt。"""

    __tablename__ = "extraction_prompt"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    task_id: Mapped[int] = mapped_column(
        ForeignKey("extraction_task.id", ondelete="CASCADE"), unique=True, index=True
    )
    prompt_text: Mapped[str] = mapped_column(Text)
    field_codes: Mapped[list] = mapped_column(JSONB)
    selected_visit_index: Mapped[int | None] = mapped_column(Integer)
    source_text_chars: Mapped[int] = mapped_column(Integer, default=0)
    source_pages_used: Mapped[int] = mapped_column(Integer, default=0)

    task: Mapped["ExtractionTask"] = relationship(back_populates="prompt")


class ExtractionResult(Base, TimestampMixin):
    """Step7 输出：字段级提取结果（raw）。"""

    __tablename__ = "extraction_result"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    task_id: Mapped[int] = mapped_column(
        ForeignKey("extraction_task.id", ondelete="CASCADE"), unique=True, index=True
    )
    fields: Mapped[dict] = mapped_column(JSONB)
    model_name: Mapped[str | None] = mapped_column(String(100))
    token_usage: Mapped[int] = mapped_column(Integer, default=0)
    stub: Mapped[bool] = mapped_column(Boolean, default=False)
    stage: Mapped[str] = mapped_column(String(20), default="raw")

    task: Mapped["ExtractionTask"] = relationship(back_populates="extraction_result")


class ExtractionMappedResult(Base, TimestampMixin):
    """Step10 输出：按保险公司字段名映射后的结果。"""

    __tablename__ = "extraction_mapped_result"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    task_id: Mapped[int] = mapped_column(
        ForeignKey("extraction_task.id", ondelete="CASCADE"), unique=True, index=True
    )
    insurance_company: Mapped[str] = mapped_column(String(100))
    template_id: Mapped[int | None] = mapped_column(
        ForeignKey("policy_template.id", ondelete="SET NULL")
    )
    mapping_source: Mapped[str] = mapped_column(String(20), default="fallback")
    fields: Mapped[dict] = mapped_column(JSONB)
    unmapped_fields: Mapped[list] = mapped_column(JSONB, default=list)

    task: Mapped["ExtractionTask"] = relationship(back_populates="mapped_result")
