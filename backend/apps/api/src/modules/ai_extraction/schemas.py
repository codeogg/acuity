from pydantic import BaseModel


class ExtractRequest(BaseModel):
    medical_record_text: str
    template_id: int


class ExtractedField(BaseModel):
    value: str | None
    confidence: float


class ExtractResponse(BaseModel):
    extracted_fields: dict[str, ExtractedField]
    process_time_ms: int
    token_usage: int
