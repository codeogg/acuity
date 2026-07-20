from datetime import datetime

from pydantic import BaseModel, ConfigDict, field_serializer

from src.core.i18n import translate_message


class TemplateOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company_id: int
    template_name: str
    template_code: str
    version: str
    original_pdf_url: str
    page_count: int
    page_width: float | None
    page_height: float | None
    parse_status: str
    parse_progress: int = 0
    parse_message: str | None = None
    parse_error: str | None = None
    is_active: bool
    created_at: datetime

    @field_serializer("parse_message", "parse_error")
    def serialize_parse_message(self, value: str | None) -> str | None:
        return translate_message(value)


class TemplateUploadResponse(BaseModel):
    id: int
    parse_status: str


class TemplateFileReplaceResponse(BaseModel):
    id: int
    parse_status: str


class ParseProgressOut(BaseModel):
    percent: int
    message: str | None = None
    status: str | None = None

    @field_serializer("message")
    def serialize_message(self, value: str | None) -> str | None:
        return translate_message(value)


class ReparseResponse(BaseModel):
    id: int
    parse_status: str
    parse_job_id: str | None = None


class TemplateUpdate(BaseModel):
    template_name: str | None = None
    company_id: int | None = None


class FieldMappingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    standard_field_id: int | None
    transform_rule_id: int | None
    fixed_value: str | None
    checkbox_map_value: str | None
    template_specific_field_code: str | None
    template_specific_ai_hint: str | None


class TemplateFieldOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    template_id: int
    page_no: int
    field_label_raw: str | None
    pdf_field_name: str | None
    field_type: str
    pos_x: float
    pos_y: float
    width: float
    height: float
    font_size: float
    recognize_source: str
    confidence_score: float | None
    is_confirmed: bool
    field_status: str
    ignore_reason: str | None = None
    row_version: int
    mapping: FieldMappingOut | None = None


class TemplateFieldCreate(BaseModel):
    page_no: int = 1
    field_label_raw: str | None = None
    field_type: str = "text"
    pos_x: float
    pos_y: float
    width: float
    height: float
    font_size: float = 10


class TemplateFieldUpdate(BaseModel):
    row_version: int  # 乐观锁必传
    page_no: int | None = None
    field_label_raw: str | None = None
    field_type: str | None = None
    pos_x: float | None = None
    pos_y: float | None = None
    width: float | None = None
    height: float | None = None
    font_size: float | None = None
    is_confirmed: bool | None = None


class FieldMappingSave(BaseModel):
    standard_field_id: int | None = None
    fixed_value: str | None = None
    checkbox_map_value: str | None = None
    transform_rule_id: int | None = None
    template_specific_field_code: str | None = None
    template_specific_ai_hint: str | None = None
    confirm: bool = False


class FieldMappingSaveResult(BaseModel):
    """Saved mapping row id, matching the frontend OpenAPI contract."""

    id: int


class FieldIgnoreSave(BaseModel):
    row_version: int
    reason: str | None = None


class FieldRestoreSave(BaseModel):
    row_version: int


class MissingRequiredFieldOut(BaseModel):
    field_code: str
    field_name: str


class PublishPreviewOut(BaseModel):
    total_count: int
    processed_count: int
    pending_count: int
    missing_required: list[MissingRequiredFieldOut]


class PreviewFillRequest(BaseModel):
    sample_values: dict[str, str]


class PreviewFillResponse(BaseModel):
    preview_pdf_url: str
