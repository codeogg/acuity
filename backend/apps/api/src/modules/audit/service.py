"""Unified audit logging: PHI-safe writes + list/detail reads."""

from __future__ import annotations

import re
from typing import Any, Literal

from sqlalchemy import Select, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from src.core.exceptions import NotFoundException, ValidationException
from src.db.models import AdminUser
from src.db.models.audit import AuditLog
from src.modules.audit.schemas import (
    ACTION_TYPES,
    ActionType,
    AuditLogOut,
    AuditMode,
)

# Keys / patterns that must never appear in patient-scoped audit payloads.
_PHI_KEY_RE = re.compile(
    r"(?i)^(patient_?name|full_?name|real_?name|given_?name|family_?name|"
    r"name_zh|name_en|chinese_?name|english_?name|"
    r"hkid|id_?(no|number|card)|national_?id|passport|"
    r"身份证|身分證|姓名|病人姓名|证件号|證件號|"
    r"phone|mobile|email|address|dob|date_of_birth|birth_?date)$"
)
_PHI_VALUE_HINT_RE = re.compile(
    r"(?i)\b([A-Z]\d{6}\(\d\)|\d{17}[\dXx]|patient\s*name|身份证|身分證)\b"
)

PATIENT_SCOPED_ACTIONS: frozenset[str] = frozenset({"patient_data_view"})


def _scrub_string(value: str, *, strict: bool) -> str:
    if strict and _PHI_VALUE_HINT_RE.search(value):
        raise ValidationException(
            "审计日志禁止写入病人真实识别信息，请使用代理识别码或脱敏引用"
        )
    return value


def _sanitize_detail(
    detail: dict[str, Any] | None,
    *,
    action_type: str,
) -> dict[str, Any] | None:
    if detail is None:
        return None
    strict = action_type in PATIENT_SCOPED_ACTIONS

    def walk(obj: Any, path: str = "") -> Any:
        if isinstance(obj, dict):
            out: dict[str, Any] = {}
            for key, val in obj.items():
                key_str = str(key)
                if _PHI_KEY_RE.match(key_str):
                    raise ValidationException(
                        f"审计 detail 禁止包含病人识别字段：{key_str}"
                    )
                out[key_str] = walk(val, f"{path}.{key_str}" if path else key_str)
            return out
        if isinstance(obj, list):
            return [walk(item, path) for item in obj]
        if isinstance(obj, str):
            return _scrub_string(obj, strict=strict or bool(path))
        return obj

    return walk(detail)


def _sanitize_field_set(field_set: str | None, *, action_type: str) -> str | None:
    if field_set is None:
        return None
    text_val = field_set.strip()
    if not text_val:
        return None
    # Always block obvious PHI tokens in field_set (compliance hard rule).
    if _PHI_KEY_RE.match(text_val) or _PHI_VALUE_HINT_RE.search(text_val):
        raise ValidationException(
            "审计 field_set 禁止写入病人真实识别信息，请使用代理识别码或脱敏引用"
        )
    return text_val[:255]


def _sanitize_target_ref(target_ref: str | None, *, action_type: str) -> str | None:
    if target_ref is None:
        return None
    text_val = target_ref.strip()
    if not text_val:
        return None
    if action_type in PATIENT_SCOPED_ACTIONS:
        text_val = _scrub_string(text_val, strict=True)
    elif _PHI_VALUE_HINT_RE.search(text_val):
        raise ValidationException(
            "审计 target_ref 禁止写入病人真实识别信息，请使用代理识别码或脱敏引用"
        )
    return text_val[:255]


async def _next_event_code(db: AsyncSession) -> str:
    n = (await db.execute(text("SELECT nextval('audit_event_code_seq')"))).scalar_one()
    return f"EV-{int(n)}"


async def log_audit(
    db: AsyncSession,
    *,
    action_type: ActionType | str,
    operator_id: int,
    clinic_id: int | None = None,
    target_ref: str | None = None,
    mode: AuditMode | str | None = None,
    field_set: str | None = None,
    detail: dict[str, Any] | None = None,
) -> AuditLog:
    """Append one audit row. Raises ValidationException if PHI leaks into payload."""
    action = str(action_type).strip()
    if action not in ACTION_TYPES:
        raise ValidationException(f"不支持的审计操作类型：{action}")

    mode_val: str | None = None
    if mode is not None and str(mode).strip():
        mode_val = str(mode).strip()
        if mode_val not in {"view-as", "act-as"}:
            raise ValidationException("mode 仅支持 view-as / act-as / null")

    row = AuditLog(
        event_code=await _next_event_code(db),
        action_type=action,
        operator_id=operator_id,
        clinic_id=clinic_id,
        target_ref=_sanitize_target_ref(target_ref, action_type=action),
        mode=mode_val,
        field_set=_sanitize_field_set(field_set, action_type=action),
        detail=_sanitize_detail(detail, action_type=action),
    )
    db.add(row)
    await db.flush()
    return row


def audit_to_out(row: AuditLog, *, operator_name: str | None = None) -> AuditLogOut:
    return AuditLogOut(
        id=row.id,
        event_code=row.event_code,
        action_type=row.action_type,
        operator_id=row.operator_id,
        operator_name=operator_name,
        clinic_id=row.clinic_id,
        target_ref=row.target_ref,
        mode=row.mode,  # type: ignore[arg-type]
        field_set=row.field_set,
        detail=row.detail,
        created_at=row.created_at,
    )


async def get_audit_by_event_code(db: AsyncSession, event_code: str) -> AuditLogOut:
    operator = aliased(AdminUser)
    result = (
        await db.execute(
            select(AuditLog, operator)
            .outerjoin(operator, operator.id == AuditLog.operator_id)
            .where(AuditLog.event_code == event_code)
        )
    ).first()
    if result is None:
        raise NotFoundException("审计事件不存在")
    row, admin = result
    name = None
    if admin is not None:
        name = (admin.real_name or "").strip() or admin.username
    return audit_to_out(row, operator_name=name)


async def list_audit_logs(
    db: AsyncSession,
    *,
    page: int,
    page_size: int,
    scope: Literal["global", "clinic"] | None = None,
    operator_id: int | None = None,
    action_type: str | None = None,
    clinic_id: int | None = None,
) -> tuple[list[AuditLogOut], int]:
    operator = aliased(AdminUser)
    stmt: Select[Any] = select(AuditLog, operator).outerjoin(
        operator, operator.id == AuditLog.operator_id
    )
    count_stmt = select(func.count()).select_from(AuditLog)

    if scope == "clinic":
        stmt = stmt.where(AuditLog.clinic_id.is_not(None))
        count_stmt = count_stmt.where(AuditLog.clinic_id.is_not(None))
    elif scope == "global":
        # Global trail includes everything; no extra filter.
        pass

    if operator_id is not None:
        stmt = stmt.where(AuditLog.operator_id == operator_id)
        count_stmt = count_stmt.where(AuditLog.operator_id == operator_id)
    if action_type:
        stmt = stmt.where(AuditLog.action_type == action_type)
        count_stmt = count_stmt.where(AuditLog.action_type == action_type)
    if clinic_id is not None:
        stmt = stmt.where(AuditLog.clinic_id == clinic_id)
        count_stmt = count_stmt.where(AuditLog.clinic_id == clinic_id)

    total = (await db.execute(count_stmt)).scalar_one()
    rows = (
        await db.execute(
            stmt.order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).all()

    items: list[AuditLogOut] = []
    for row, admin in rows:
        name = None
        if admin is not None:
            name = (admin.real_name or "").strip() or admin.username
        items.append(audit_to_out(row, operator_name=name))
    return items, total
