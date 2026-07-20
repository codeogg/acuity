"""PDF 提取流水线各 Step 的 JSON 契约（Pydantic）。"""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_serializer

from src.core.i18n import translate_message

ExtractionTaskStatus = Literal[
    "WAITING",
    "PREPROCESSING",
    "OCR",
    "CLASSIFYING",
    "VISIT_SELECT",
    "EXTRACTING",
    "VALIDATING",
    "MAPPING",
    "REVIEW",
    "COMPLETED",
    "FAILED",
]


class Step1UploadInput(BaseModel):
    """Step1 输入契约（服务层；file_bytes 由 HTTP 层注入，不入 JSON 日志）。"""

    clinic_id: int
    doctor_id: int
    original_filename: str
    patient_name: str | None = None


class Step1UploadOutput(BaseModel):
    """Step1 输出契约。"""

    task_id: str = Field(description="任务编号 task_no")
    status: Literal["WAITING"] = "WAITING"
    clinic_id: int
    doctor_id: int
    patient_name: str | None = None
    original_filename: str
    pdf_url: str
    file_size_bytes: int
    created_at: datetime


PageSource = Literal["text_layer", "ocr_required"]


class Step2PreprocessInput(BaseModel):
    """Step2 输入契约。"""

    task_id: str
    clinic_id: int
    pdf_url: str


class Step2PageOutput(BaseModel):
    """Step2 单页输出契约。"""

    task_id: str
    page: int = Field(ge=1)
    source: PageSource
    text: str | None = None
    image_path: str | None = None


class Step2PreprocessOutput(BaseModel):
    """Step2 完整输出契约。"""

    task_id: str
    status: Literal["OCR"] = "OCR"
    page_count: int
    text_layer_count: int
    ocr_required_count: int
    pages: list[Step2PageOutput]


class DocumentPageOut(BaseModel):
    """document_page 表记录（API 响应）。"""

    id: int
    page: int = Field(validation_alias="page_no", serialization_alias="page")
    source: PageSource
    text: str | None
    image_path: str | None
    created_at: datetime

    model_config = {"from_attributes": True, "populate_by_name": True}


class OcrBlockOut(BaseModel):
    text: str
    bbox: list[float] | None = None
    confidence: float


class Step3PageSourceInput(BaseModel):
    page: int = Field(ge=1)
    source: PageSource
    text: str | None = None
    image_path: str | None = None


class Step3OcrInput(BaseModel):
    task_id: str
    pages: list[Step3PageSourceInput]


class Step3PageOcrOutput(BaseModel):
    task_id: str
    page: int = Field(ge=1)
    blocks: list[OcrBlockOut]


class Step3OcrOutput(BaseModel):
    task_id: str
    status: Literal["CLASSIFYING"] = "CLASSIFYING"
    page_count: int
    ocr_page_count: int
    text_layer_page_count: int
    total_blocks: int
    pages: list[Step3PageOcrOutput]


class OcrResultOut(BaseModel):
    id: int
    page: int = Field(validation_alias="page_no", serialization_alias="page")
    blocks: list[OcrBlockOut]
    created_at: datetime

    model_config = {"from_attributes": True, "populate_by_name": True}


class DocumentClassificationOut(BaseModel):
    document_type: str
    language: str
    multiple_patient: bool
    multiple_visit: bool
    insurance_company: str | None
    need_visit_selector: bool
    source_text_chars: int
    source_pages_used: int
    model_name: str | None
    token_usage: int
    stub: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class Step4ClassifyOutput(BaseModel):
    task_id: str
    status: Literal["VISIT_SELECT", "EXTRACTING"]
    classification: DocumentClassificationOut
    source_text_preview: str


class VisitCandidateOut(BaseModel):
    id: int
    visit_index: int
    visit_date: str | None
    summary: str | None
    page_range: list[int]
    selected: bool
    model_name: str | None
    token_usage: int
    stub: bool
    created_at: datetime

    model_config = {"from_attributes": True}

    @classmethod
    def from_row(cls, row) -> "VisitCandidateOut":
        return cls(
            id=row.id,
            visit_index=row.visit_index,
            visit_date=row.visit_date,
            summary=row.summary,
            page_range=[row.page_start, row.page_end],
            selected=row.selected,
            model_name=row.model_name,
            token_usage=row.token_usage,
            stub=row.stub,
            created_at=row.created_at,
        )


class Step5DetectVisitsOutput(BaseModel):
    task_id: str
    status: Literal["VISIT_SELECT"] = "VISIT_SELECT"
    visits: list[VisitCandidateOut]
    source_text_preview: str


class Step5SelectVisitInput(BaseModel):
    visit_index: int = Field(ge=1)


class Step5SelectVisitOutput(BaseModel):
    task_id: str
    status: Literal["EXTRACTING"] = "EXTRACTING"
    selected_visit: VisitCandidateOut


FieldExtractionStatus = Literal["extracted", "missing", "low_confidence"]


class ExtractedFieldValueOut(BaseModel):
    value: str | None
    status: FieldExtractionStatus
    confidence: float
    validation_error: str | None = None

    @field_serializer("validation_error")
    def serialize_validation_error(self, value: str | None) -> str | None:
        return translate_message(value)


class ExtractionPromptOut(BaseModel):
    prompt_text: str
    field_codes: list[str]
    selected_visit_index: int | None
    source_text_chars: int
    source_pages_used: int
    created_at: datetime

    model_config = {"from_attributes": True}


class Step6BuildPromptOutput(BaseModel):
    task_id: str
    status: Literal["EXTRACTING"] = "EXTRACTING"
    prompt: ExtractionPromptOut
    prompt_preview: str


class ExtractionResultOut(BaseModel):
    fields: dict[str, ExtractedFieldValueOut]
    model_name: str | None
    token_usage: int
    stub: bool
    stage: str
    created_at: datetime

    model_config = {"from_attributes": True}

    @classmethod
    def from_row(cls, row) -> "ExtractionResultOut":
        fields = {
            code: ExtractedFieldValueOut.model_validate(value)
            for code, value in (row.fields or {}).items()
        }
        return cls(
            fields=fields,
            model_name=row.model_name,
            token_usage=row.token_usage,
            stub=row.stub,
            stage=row.stage,
            created_at=row.created_at,
        )


class Step7ExtractFieldsOutput(BaseModel):
    task_id: str
    status: Literal["VALIDATING"] = "VALIDATING"
    result: ExtractionResultOut


class Step8ValidateOutput(BaseModel):
    task_id: str
    status: Literal["VALIDATING"] = "VALIDATING"
    result: ExtractionResultOut


class Step9DetectMissingOutput(BaseModel):
    task_id: str
    status: Literal["MAPPING"] = "MAPPING"
    result: ExtractionResultOut


class MappedFieldValueOut(BaseModel):
    value: str | None
    status: FieldExtractionStatus
    confidence: float
    validation_error: str | None = None
    source_field: str

    @field_serializer("validation_error")
    def serialize_validation_error(self, value: str | None) -> str | None:
        return translate_message(value)


class ExtractionMappedResultOut(BaseModel):
    insurance_company: str
    template_id: int | None
    mapping_source: str
    fields: dict[str, MappedFieldValueOut]
    unmapped_fields: list[str]
    created_at: datetime

    model_config = {"from_attributes": True}

    @classmethod
    def from_row(cls, row) -> "ExtractionMappedResultOut":
        fields = {
            code: MappedFieldValueOut.model_validate(value)
            for code, value in (row.fields or {}).items()
        }
        return cls(
            insurance_company=row.insurance_company,
            template_id=row.template_id,
            mapping_source=row.mapping_source,
            fields=fields,
            unmapped_fields=list(row.unmapped_fields or []),
            created_at=row.created_at,
        )


class Step10MapInput(BaseModel):
    insurance_company: str | None = None
    template_id: int | None = None


class Step10MapOutput(BaseModel):
    task_id: str
    status: Literal["REVIEW"] = "REVIEW"
    result: ExtractionMappedResultOut


class FinalizeExtractionInput(BaseModel):
    insurance_company: str | None = None
    template_id: int | None = None


class FinalizeExtractionOutput(BaseModel):
    """Step8–10 合并输出：校验 + 缺失检测 + 保险映射。"""

    task_id: str
    status: Literal["REVIEW"] = "REVIEW"
    extraction_result: ExtractionResultOut
    mapped_result: ExtractionMappedResultOut


class ReviewFieldValueOut(BaseModel):
    """Step11 标准字段（含 OCR 溯源）。"""

    value: str | None
    status: FieldExtractionStatus
    confidence: float
    validation_error: str | None = None
    page: int | None = None
    bbox: list[float] | None = None
    source_text: str | None = None

    @field_serializer("validation_error")
    def serialize_validation_error(self, value: str | None) -> str | None:
        return translate_message(value)


class ExtractionReviewOutputOut(BaseModel):
    task_id: str
    insurance_company: str | None
    standard_fields: dict[str, ReviewFieldValueOut]
    mapped_fields: dict[str, MappedFieldValueOut] | None = None
    display_fields: dict[str, ReviewFieldValueOut]
    template_specific_field_codes: list[str] = []
    field_labels: dict[str, str] | None = None
    is_confirmed: bool
    reviewed_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}

    @classmethod
    def from_row(
        cls,
        task_no: str,
        row,
        *,
        template_specific_field_codes: list[str] | None = None,
        field_labels: dict[str, str] | None = None,
    ) -> "ExtractionReviewOutputOut":
        from src.modules.pdf_extraction.steps.step11_review_output import (
            merge_review_fields_for_display,
        )

        standard_fields = {
            code: ReviewFieldValueOut.model_validate(value)
            for code, value in (row.standard_fields or {}).items()
        }
        mapped_fields = None
        if row.mapped_fields:
            mapped_fields = {
                code: MappedFieldValueOut.model_validate(value)
                for code, value in row.mapped_fields.items()
            }
        display_merged = merge_review_fields_for_display(
            row.standard_fields or {},
            row.edited_fields,
        )
        display_fields = {
            code: ReviewFieldValueOut.model_validate(value)
            for code, value in display_merged.items()
        }
        return cls(
            task_id=task_no,
            insurance_company=row.insurance_company,
            standard_fields=standard_fields,
            mapped_fields=mapped_fields,
            display_fields=display_fields,
            template_specific_field_codes=list(template_specific_field_codes or []),
            field_labels=field_labels or None,
            is_confirmed=row.is_confirmed,
            reviewed_at=row.reviewed_at,
            created_at=row.created_at,
        )


class Step11PrepareReviewOutput(BaseModel):
    task_id: str
    status: Literal["REVIEW"] = "REVIEW"
    review: ExtractionReviewOutputOut


class ReviewFieldEditIn(BaseModel):
    value: str | None = None


class Step11SaveReviewInput(BaseModel):
    fields: dict[str, ReviewFieldEditIn]


class Step11SaveReviewOutput(BaseModel):
    task_id: str
    status: Literal["REVIEW"] = "REVIEW"
    review: ExtractionReviewOutputOut


class Step11ConfirmReviewOutput(BaseModel):
    task_id: str
    status: Literal["COMPLETED"] = "COMPLETED"
    review: ExtractionReviewOutputOut


class ExtractionTaskOut(BaseModel):
    """任务详情（API 响应）。"""

    id: int
    task_id: str = Field(validation_alias="task_no", serialization_alias="task_id")
    status: ExtractionTaskStatus
    clinic_id: int
    doctor_id: int
    patient_name: str | None
    original_filename: str
    pdf_url: str
    file_size_bytes: int
    current_step: str | None
    error_message: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True, "populate_by_name": True}

    @field_serializer("error_message")
    def serialize_error_message(self, value: str | None) -> str | None:
        return translate_message(value)
