from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ClinicRetentionOut(BaseModel):
    """Effective retention for a clinic (default or override)."""

    clinic_id: int
    retention_days: int
    is_overridden: bool
    policy_name: str | None = None
    overridden_at: datetime | None = None
    overridden_by: int | None = None


class ClinicRetentionOverrideRequest(BaseModel):
    clinic_code_input: str = Field(min_length=1, max_length=50)
    retention_days: int = Field(ge=1, le=36500)


class ClinicRetentionAuditOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    clinic_id: int
    clinic_code_input: str
    old_retention_days: int
    new_retention_days: int
    operated_by: int
    operator_name: str | None = None
    operated_at: datetime
    ip_address: str | None = None
