from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

DataRegion = Literal["香港", "新加坡", "美国"]
DATA_REGIONS: frozenset[str] = frozenset({"香港", "新加坡", "美国"})


class ClinicCreate(BaseModel):
    clinic_name: str
    clinic_name_en: str | None = None
    clinic_code: str | None = None
    address: str | None = None
    phone: str | None = None
    chop_image_url: str | None = None
    district_id: int | None = None
    data_region: DataRegion | None = None


class ClinicUpdate(BaseModel):
    clinic_name: str | None = None
    clinic_name_en: str | None = None
    address: str | None = None
    phone: str | None = None
    chop_image_url: str | None = None
    idle_lock_minutes: int | None = None
    district_id: int | None = None
    data_region: DataRegion | None = None


class ClinicStatusUpdate(BaseModel):
    status: int  # 0停用 1启用


class ClinicFlagUpdate(BaseModel):
    is_flagged: int = Field(ge=0, le=1, description="0 = 取消标记，1 = 需要關注")


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
    idle_lock_minutes: int
    data_region: str
    is_flagged: int
    # provisioning | onboarding | active — operational lifecycle (not is_flagged).
    lifecycle_status: str = "provisioning"
    district_id: int | None = None
    district_name_zh: str | None = None
    district_name_en: str | None = None
    created_at: datetime
    # Joined from clinic_subscriptions (1:1) for list filters / CRM badges.
    subscription_status: str | None = None
    payment_status: str | None = None
    plan_code: str | None = None


class OnboardingStepOut(BaseModel):
    step_code: str
    step_name: str
    step_name_en: str
    sort_order: int
    status: Literal["pending", "completed"]
    completed_at: datetime | None = None


class OnboardingProgressOut(BaseModel):
    clinic_id: int
    lifecycle_status: str
    completed: int
    total: int
    progress_label: str
    all_completed: bool
    can_confirm_activate: bool
    current_step_code: str | None = None
    current_step_name: str | None = None
    current_step_name_en: str | None = None
    steps: list[OnboardingStepOut]


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
