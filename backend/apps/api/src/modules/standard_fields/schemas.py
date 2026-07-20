from datetime import datetime

from pydantic import BaseModel, ConfigDict


class DomainCreate(BaseModel):
    domain_code: str
    domain_name: str
    sort_order: int = 0
    remark: str | None = None


class DomainOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    domain_code: str
    domain_name: str
    sort_order: int
    remark: str | None


class StandardFieldCreate(BaseModel):
    field_code: str
    field_name: str
    field_name_en: str | None = None
    domain_id: int
    data_type: str  # text/number/date/boolean/enum/table/image/signature
    enum_options: list[str] | None = None
    is_required: bool = False
    source_type: str = "AI"  # AI/SYSTEM/MANUAL
    ai_extraction_hint: str | None = None
    validation_rule: str | None = None
    example_value: str | None = None


class StandardFieldUpdate(BaseModel):
    field_name: str | None = None
    field_name_en: str | None = None
    domain_id: int | None = None
    data_type: str | None = None
    enum_options: list[str] | None = None
    is_required: bool | None = None
    source_type: str | None = None
    ai_extraction_hint: str | None = None
    validation_rule: str | None = None
    example_value: str | None = None
    is_active: bool | None = None


class StandardFieldOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    field_code: str
    field_name: str
    field_name_en: str | None
    domain_id: int
    data_type: str
    enum_options: list[str] | None
    is_required: bool
    source_type: str
    ai_extraction_hint: str | None
    validation_rule: str | None
    example_value: str | None
    is_active: bool
    created_at: datetime


class TransformRuleCreate(BaseModel):
    rule_code: str
    rule_name: str
    rule_type: str
    rule_config: dict | None = None
    remark: str | None = None


class TransformRuleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    rule_code: str
    rule_name: str
    rule_type: str
    rule_config: dict | None
    remark: str | None
