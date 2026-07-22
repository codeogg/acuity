from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

ActionType = Literal[
    "account_creation",
    "simulation_start",
    "simulation_end",
    "simulation_interrupt",
    "proxy_edit",
    "retention_override",
    "template_publish",
    "template_archive",
    "crm_billing_edit",
    "tag_category_change",
    "batch_operation",
    "export",
    "patient_data_view",
    "mfa_reset",
    "account_unlock",
    "invite_resend",
]

ACTION_TYPES: frozenset[str] = frozenset(
    {
        "account_creation",
        "simulation_start",
        "simulation_end",
        "simulation_interrupt",
        "proxy_edit",
        "retention_override",
        "template_publish",
        "template_archive",
        "crm_billing_edit",
        "tag_category_change",
        "batch_operation",
        "export",
        "patient_data_view",
        "mfa_reset",
        "account_unlock",
        "invite_resend",
    }
)

AuditMode = Literal["view-as", "act-as"]


class AuditLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    event_code: str
    action_type: str
    operator_id: int
    operator_name: str | None = None
    clinic_id: int | None = None
    target_ref: str | None = None
    mode: AuditMode | None = None
    field_set: str | None = None
    detail: dict[str, Any] | None = None
    created_at: datetime


class AuditLogCreate(BaseModel):
    """Client-driven audit write (e.g. simulation start/end until those land server-side)."""

    action_type: ActionType
    clinic_id: int | None = None
    target_ref: str | None = Field(default=None, max_length=255)
    mode: AuditMode | None = None
    field_set: str | None = Field(default=None, max_length=255)
    detail: dict[str, Any] | None = None
