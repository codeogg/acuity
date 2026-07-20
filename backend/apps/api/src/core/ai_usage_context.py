"""跨业务层传递 AI 调用归因信息。"""
from __future__ import annotations

from contextvars import ContextVar, Token
from dataclasses import dataclass, replace


@dataclass(frozen=True, slots=True)
class AiCallContext:
    purpose: str
    clinic_id: int | None = None
    doctor_id: int | None = None
    admin_user_id: int | None = None
    submission_id: int | None = None


_ai_call_context: ContextVar[AiCallContext | None] = ContextVar(
    "ai_call_context", default=None
)


def set_ai_call_context(
    *,
    purpose: str,
    clinic_id: int | None = None,
    doctor_id: int | None = None,
    admin_user_id: int | None = None,
    submission_id: int | None = None,
) -> Token[AiCallContext | None]:
    """设置当前异步任务的 AI 调用上下文，并返回用于精确恢复的 token。"""
    current = _ai_call_context.get()
    context = AiCallContext(
        purpose=purpose,
        clinic_id=clinic_id if clinic_id is not None else getattr(current, "clinic_id", None),
        doctor_id=doctor_id if doctor_id is not None else getattr(current, "doctor_id", None),
        admin_user_id=(
            admin_user_id
            if admin_user_id is not None
            else getattr(current, "admin_user_id", None)
        ),
        submission_id=(
            submission_id
            if submission_id is not None
            else getattr(current, "submission_id", None)
        ),
    )
    return _ai_call_context.set(context)


def get_ai_call_context() -> AiCallContext | None:
    return _ai_call_context.get()


def reset_ai_call_context(token: Token[AiCallContext | None]) -> None:
    _ai_call_context.reset(token)


def with_ai_call_purpose(purpose: str) -> Token[AiCallContext | None]:
    """保留当前归因，仅覆盖调用目的。"""
    current = _ai_call_context.get()
    if current is None:
        return _ai_call_context.set(AiCallContext(purpose=purpose))
    return _ai_call_context.set(replace(current, purpose=purpose))
