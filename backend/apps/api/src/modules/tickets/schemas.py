from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

TicketStatus = Literal["open", "in-progress", "resolved"]


class TicketOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    clinic_id: int
    subject_zh: str
    subject_en: str
    status: TicketStatus
    owner: str | None
    updated_at: datetime
    notes: list[str]


class TicketUpdate(BaseModel):
    status: TicketStatus | None = None
    owner: str | None = None
    add_note: str | None = None


class TicketResolveRequest(BaseModel):
    resolution_note: str | None = None


class OnboardingQueueItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    clinic_id: int
    next_step_zh: str
    next_step_en: str
    progress_step: int
    progress_total: int
    updated_at: datetime


class TicketCreate(BaseModel):
    """Internal/admin helper — not yet in public console contract."""

    clinic_id: int
    subject_zh: str = Field(min_length=1, max_length=200)
    subject_en: str = Field(min_length=1, max_length=200)
    owner: str | None = None
