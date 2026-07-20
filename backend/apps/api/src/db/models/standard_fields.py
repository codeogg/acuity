"""标准字段库相关模型。"""
from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.db.base import Base, TimestampMixin


class FieldDomain(Base, TimestampMixin):
    __tablename__ = "field_domain"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    domain_code: Mapped[str] = mapped_column(String(50), unique=True)
    domain_name: Mapped[str] = mapped_column(String(100))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    remark: Mapped[str | None] = mapped_column(String(255))

    fields: Mapped[list["StandardField"]] = relationship(back_populates="domain")


class StandardField(Base, TimestampMixin):
    __tablename__ = "standard_field"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    field_code: Mapped[str] = mapped_column(String(100), unique=True)
    field_name: Mapped[str] = mapped_column(String(100))
    field_name_en: Mapped[str | None] = mapped_column(String(100))
    domain_id: Mapped[int] = mapped_column(ForeignKey("field_domain.id"))
    # text/number/date/boolean/enum/table/image/signature
    data_type: Mapped[str] = mapped_column(String(20))
    enum_options: Mapped[list | None] = mapped_column(JSONB)
    is_required: Mapped[bool] = mapped_column(Boolean, default=False)
    source_type: Mapped[str] = mapped_column(String(20), default="AI")  # AI/SYSTEM/MANUAL
    ai_extraction_hint: Mapped[str | None] = mapped_column(Text)
    validation_rule: Mapped[str | None] = mapped_column(String(255))
    example_value: Mapped[str | None] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    domain: Mapped["FieldDomain"] = relationship(back_populates="fields")


class FieldTransformRule(Base):
    __tablename__ = "field_transform_rule"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    rule_code: Mapped[str] = mapped_column(String(50), unique=True)
    rule_name: Mapped[str] = mapped_column(String(100))
    # DATE_FORMAT/CONCAT/SPLIT/ENUM_MAP/CUSTOM_SCRIPT
    rule_type: Mapped[str] = mapped_column(String(30))
    rule_config: Mapped[dict | None] = mapped_column(JSONB)
    remark: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
