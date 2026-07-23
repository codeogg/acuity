from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_serializer

from src.core.i18n import translate_message


class CompanyBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company_name: str
    company_name_en: str | None
    logo_url: str | None


class TemplateBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    template_name: str
    version: str
    page_count: int


class ClaimCreate(BaseModel):
    company_id: int
    template_id: int


class MedicalRecordSubmit(BaseModel):
    medical_record_text: str
    patient_name: str | None = None


class FieldsUpdate(BaseModel):
    final_field_values: dict[str, str | None]
    confirmed: dict[str, bool] | None = None
    row_version: int | None = Field(default=None, ge=1)


class ClaimOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    submission_no: str
    clinic_id: int
    doctor_id: int
    company_id: int
    template_id: int
    template_version: str | None
    patient_name: str | None
    patient_name_cn: str | None = None
    patient_name_en: str | None = None
    extraction_task_id: int | None = None
    extraction_task_no: str | None = None
    ai_raw_result: dict | None
    final_field_values: dict | None
    field_confirmations: dict | None = None
    row_version: int = 1
    ai_token_usage: int | None
    ai_process_time_ms: int | None
    generated_pdf_url: str | None
    status: str
    created_at: datetime
    updated_at: datetime


class ClaimListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    submission_no: str
    patient_name: str | None
    patient_name_cn: str | None = None
    patient_name_en: str | None = None
    company_id: int
    template_id: int
    generated_pdf_url: str | None
    status: str
    created_at: datetime
    # Display labels joined for list UIs (Completed / home). Optional so older
    # clients keep working; populated by list_claims.
    company_name: str | None = None
    company_name_en: str | None = None
    template_name: str | None = None
    clinic_id: int | None = None
    clinic_name: str | None = None


class GeneratePdfResponse(BaseModel):
    pdf_url: str
    generated_at: str


class ReuseRequest(BaseModel):
    new_template_id: int


class ReuseResponse(BaseModel):
    submission_id: int
    prefilled_fields: dict[str, str | None]
    missing_fields: list[str]


class DraftSave(BaseModel):
    patient_name: str | None = None
    medical_record_text: str | None = None


class DraftSaveResponse(BaseModel):
    saved_at: datetime


class ClaimMedicalPdfUploadOutput(BaseModel):
    extraction_task_id: int
    extraction_task_no: str
    original_filename: str
    patient_name: str | None = None


class ExtractProgressVisit(BaseModel):
    visit_index: int
    visit_date: str | None = None
    summary: str | None = None
    page_range: list[int] = Field(default_factory=list)
    selected: bool = False


class ExtractProgressOut(BaseModel):
    stage: str
    percent: int
    message: str | None = None
    status: str
    visits: list[ExtractProgressVisit] | None = None

    @field_serializer("message")
    def serialize_message(self, value: str | None) -> str | None:
        return translate_message(value)


class ExtractEnqueueResponse(BaseModel):
    job_id: str | None = None
    status: str = "QUEUED"
    message: str = "提取任务已入队"

    @field_serializer("message")
    def serialize_message(self, value: str) -> str:
        return translate_message(value) or value


class ResumeExtractionInput(BaseModel):
    visit_index: int = Field(ge=1)


class TemplateSpecificAiFieldOut(BaseModel):
    field_code: str
    field_name: str
    ai_extraction_hint: str | None = None


class HomeStats(BaseModel):
    today_count: int
    pending_draft_count: int
    month_total_count: int


class UnfinishedDraft(BaseModel):
    submission_id: int
    patient_name: str | None
    company_name: str
    template_name: str
    status: str
    status_label: str
    updated_at: datetime


class QuickStartShortcut(BaseModel):
    company_id: int
    company_name: str
    template_id: int
    template_name: str


class RecentClaimItem(BaseModel):
    submission_id: int
    patient_name: str | None
    company_name: str
    status: str
    status_label: str
    created_at: datetime


class HomeOverview(BaseModel):
    greeting_name: str
    clinic_name: str
    stats: HomeStats
    unfinished_drafts: list[UnfinishedDraft]
    quick_start_shortcuts: list[QuickStartShortcut]
    recent_claims: list[RecentClaimItem]
