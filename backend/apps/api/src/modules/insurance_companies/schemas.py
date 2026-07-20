from datetime import datetime

from pydantic import BaseModel, ConfigDict


class CompanyCreate(BaseModel):
    company_name: str
    company_name_en: str | None = None
    company_code: str | None = None
    logo_url: str | None = None
    contact_info: str | None = None


class CompanyUpdate(BaseModel):
    company_name: str | None = None
    company_name_en: str | None = None
    logo_url: str | None = None
    contact_info: str | None = None
    status: int | None = None


class CompanyStatusUpdate(BaseModel):
    status: int  # 0停用 1启用


class LogoUploadResponse(BaseModel):
    url: str


class CompanyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company_code: str
    company_name: str
    company_name_en: str | None
    logo_url: str | None
    contact_info: str | None
    status: int
    created_at: datetime
