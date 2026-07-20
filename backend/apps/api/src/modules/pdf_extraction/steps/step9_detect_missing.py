"""Step9：Missing Detector（本地逻辑，无 AI）。"""
from __future__ import annotations

from typing import Any

_EMPTY_VALUE_MARKERS = frozenset(
    {
        "n/a",
        "na",
        "null",
        "none",
        "unknown",
        "-",
        "—",
        "无",
        "不详",
        "未知",
    }
)


def is_empty_value(value: str | None) -> bool:
    if value is None:
        return True
    text = value.strip()
    if not text:
        return True
    return text.lower() in _EMPTY_VALUE_MARKERS


def _missing_field() -> dict[str, Any]:
    return {
        "value": None,
        "status": "missing",
        "confidence": 0.0,
        "validation_error": None,
    }


def normalize_field_missing_state(field: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(field)
    if is_empty_value(normalized.get("value")):
        normalized["value"] = None
        normalized["status"] = "missing"
        normalized["confidence"] = 0.0
        normalized["validation_error"] = None
    return normalized


def detect_missing_fields(
    fields: dict[str, dict[str, Any]],
    schema_field_codes: list[str],
) -> dict[str, dict[str, Any]]:
    """补齐 Schema 字段并将空值统一为 missing。"""
    result: dict[str, dict[str, Any]] = {}
    for code in schema_field_codes:
        existing = fields.get(code)
        if existing is None:
            result[code] = _missing_field()
            continue
        result[code] = normalize_field_missing_state(dict(existing))
    return result
