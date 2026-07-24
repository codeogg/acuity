"""运营端模拟（impersonation）API schemas。"""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

ImpersonationMode = Literal["view", "proxy"]


class ImpersonationStartRequest(BaseModel):
    clinic_id: int
    doctor_id: int
    mode: ImpersonationMode
    reason: str | None = Field(default=None, max_length=255)
    # proxy 模式必须为 true；view 可省略
    confirmed: bool | None = None
    duration_minutes: int | None = Field(default=None, ge=1, le=60)


class ImpersonationEndRequest(BaseModel):
    clinic_id: int
    doctor_id: int


class ImpersonationSessionOut(BaseModel):
    session_id: int
    clinic_id: int
    doctor_id: int
    operator_id: int
    operator: str
    mode: ImpersonationMode
    status: Literal["active", "ended", "expired"]
    reason: str | None = None
    started_at: datetime
    expire_at: datetime
    reused: bool = False
    # start 返回入口 JWT；session 查询不含令牌
    token: str | None = None
    entry_url: str | None = None


class ImpersonationSessionStateOut(BaseModel):
    active: ImpersonationSessionOut | None


class ImpersonationEntryRequest(BaseModel):
    token: str = Field(min_length=1)


class ImpersonationContextOut(BaseModel):
    session_id: int
    operator_id: int
    doctor_id: int
    clinic_id: int
    mode: ImpersonationMode


class ImpersonationEntryResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str = "DOCTOR"
    user_id: int
    clinic_id: int
    display_name: str | None = None
    impersonation: ImpersonationContextOut


class SuccessResponse(BaseModel):
    success: bool = True


class SupportAccessPendingItem(BaseModel):
    """医生端事后通知单条：一次模拟会话一条，不合并。"""

    session_id: int
    clinic_id: int
    clinic_name: str | None = None
    doctor_id: int
    operator_id: int
    operator: str
    mode: ImpersonationMode
    status: Literal["ended", "expired"]
    reason: str | None = None
    started_at: datetime
    ended_at: datetime | None = None
    expire_at: datetime
    doctor_notified_at: datetime


class SupportAccessPendingOut(BaseModel):
    items: list[SupportAccessPendingItem]


class SupportAccessAcknowledgeRequest(BaseModel):
    session_id: int
