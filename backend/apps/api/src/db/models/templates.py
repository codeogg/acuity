"""保单模板相关模型。"""
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.db.base import Base, TimestampMixin


class PolicyTemplate(Base, TimestampMixin):
    __tablename__ = "policy_template"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("insurance_company.id"), index=True)
    template_name: Mapped[str] = mapped_column(String(200))
    template_code: Mapped[str] = mapped_column(String(50))
    version: Mapped[str] = mapped_column(String(20), default="V1")
    original_pdf_url: Mapped[str] = mapped_column(String(255))
    page_count: Mapped[int] = mapped_column(Integer, default=1)
    page_width: Mapped[float | None] = mapped_column(Numeric(10, 2))
    page_height: Mapped[float | None] = mapped_column(Numeric(10, 2))
    # PENDING/PARSING/AUTO_PARSED/AI_ASSISTED/ANNOTATED/PUBLISHED/PARSE_FAILED
    parse_status: Mapped[str] = mapped_column(String(20), default="PENDING")
    parse_progress: Mapped[int] = mapped_column(SmallInteger, default=0)
    parse_message: Mapped[str | None] = mapped_column(String(255))
    parse_job_id: Mapped[str | None] = mapped_column(String(64))
    parse_error: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False)
    created_by: Mapped[int | None] = mapped_column(BigInteger)

    fields: Mapped[list["TemplateField"]] = relationship(
        back_populates="template", cascade="all, delete-orphan"
    )


class ClinicPolicyTemplate(Base):
    __tablename__ = "clinic_policy_template"
    __table_args__ = (UniqueConstraint("clinic_id", "template_id"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    clinic_id: Mapped[int] = mapped_column(ForeignKey("clinic.id"))
    template_id: Mapped[int] = mapped_column(ForeignKey("policy_template.id"))
    status: Mapped[int] = mapped_column(SmallInteger, default=1)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class TemplateField(Base, TimestampMixin):
    __tablename__ = "template_field"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    template_id: Mapped[int] = mapped_column(
        ForeignKey("policy_template.id", ondelete="CASCADE"), index=True
    )
    page_no: Mapped[int] = mapped_column(Integer, default=1)
    field_label_raw: Mapped[str | None] = mapped_column(String(255))
    pdf_field_name: Mapped[str | None] = mapped_column(String(255))
    field_type: Mapped[str] = mapped_column(String(20))  # text/checkbox/radio/signature/image/date
    pos_x: Mapped[float] = mapped_column(Numeric(10, 2))  # 左上原点(pt)
    pos_y: Mapped[float] = mapped_column(Numeric(10, 2))  # 左上原点(pt)
    width: Mapped[float] = mapped_column(Numeric(10, 2))
    height: Mapped[float] = mapped_column(Numeric(10, 2))
    font_size: Mapped[float] = mapped_column(Numeric(5, 2), default=10)
    recognize_source: Mapped[str] = mapped_column(String(20))  # AUTO_PDF/AI_VISION/MANUAL
    confidence_score: Mapped[float | None] = mapped_column(Numeric(5, 2))
    is_confirmed: Mapped[bool] = mapped_column(Boolean, default=False)
    # PENDING=待处理 / MAPPED=已映射或固定值 / IGNORED=标注员判定无需处理
    field_status: Mapped[str] = mapped_column(String(20), default="PENDING")
    ignore_reason: Mapped[str | None] = mapped_column(String(255))
    row_version: Mapped[int] = mapped_column(Integer, default=1)  # 乐观锁

    template: Mapped["PolicyTemplate"] = relationship(back_populates="fields")
    mapping: Mapped["TemplateFieldMapping | None"] = relationship(
        back_populates="template_field", uselist=False, cascade="all, delete-orphan"
    )


class TemplateFieldMapping(Base, TimestampMixin):
    __tablename__ = "template_field_mapping"
    __table_args__ = (
        CheckConstraint(
            "standard_field_id IS NOT NULL OR fixed_value IS NOT NULL OR (template_specific_field_code IS NOT NULL AND template_specific_ai_hint IS NOT NULL)",
            name="ck_mapping_source",
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    template_field_id: Mapped[int] = mapped_column(
        ForeignKey("template_field.id", ondelete="CASCADE"), unique=True
    )
    standard_field_id: Mapped[int | None] = mapped_column(ForeignKey("standard_field.id"))
    transform_rule_id: Mapped[int | None] = mapped_column(
        ForeignKey("field_transform_rule.id")
    )
    fixed_value: Mapped[str | None] = mapped_column(String(255))
    checkbox_map_value: Mapped[str | None] = mapped_column(String(100))
    # 模板专属AI提取字段
    template_specific_field_code: Mapped[str | None] = mapped_column(String(100))
    template_specific_ai_hint: Mapped[str | None] = mapped_column(Text)
    annotated_by: Mapped[int | None] = mapped_column(BigInteger)
    annotated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    template_field: Mapped["TemplateField"] = relationship(back_populates="mapping")
