from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ClinicCreate(BaseModel):
    clinic_name: str
    clinic_name_en: str | None = None
    clinic_code: str | None = None
    address: str | None = None
    phone: str | None = None
    chop_image_url: str | None = None


class ClinicUpdate(BaseModel):
    clinic_name: str | None = None
    clinic_name_en: str | None = None
    address: str | None = None
    phone: str | None = None
    chop_image_url: str | None = None


class ClinicStatusUpdate(BaseModel):
    status: int  # 0停用 1启用


class ClinicOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    clinic_code: str
    clinic_name: str
    clinic_name_en: str | None
    address: str | None
    phone: str | None
    chop_image_url: str | None
    status: int
    created_at: datetime


class ClinicInsuranceUpdate(BaseModel):
    company_ids: list[int]


# ---------- 诊所-保司-模板 配置视图 ----------
class TemplateConfigItem(BaseModel):
    template_id: int
    template_name: str
    version: str
    parse_status: str
    is_active: bool
    enabled: bool
    updated_at: datetime | None = None


class CompanyConfigItem(BaseModel):
    company_id: int
    company_name: str
    enabled: bool
    template_count: int
    enabled_template_count: int
    templates: list[TemplateConfigItem]


class ClinicConfigOverview(BaseModel):
    companies: list[CompanyConfigItem]


class CompanyEnableUpdate(BaseModel):
    enabled: bool


class CompanyEnableResult(BaseModel):
    company_id: int
    enabled: bool


class TemplateEnableUpdate(BaseModel):
    enabled: bool


class TemplateEnableResult(BaseModel):
    template_id: int
    enabled: bool


class ClinicTemplatesSet(BaseModel):
    template_ids: list[int]


class ClinicTemplatesSetResult(BaseModel):
    enabled_template_ids: list[int]
