"""Step8：Validation Engine（本地规则校验，无 AI）。"""
from __future__ import annotations

import re
from datetime import datetime
from typing import Any

from src.modules.pdf_extraction.ai_service.field_extractor import (
    ExtractedFieldValue,
    FieldExtractionStatus,
)

DATE_FIELD_CODES = frozenset(
    {"dob", "visit_date", "admission_date", "discharge_date", "operation_date"}
)
AMOUNT_FIELD_CODES = frozenset({"amount_total"})
POLICY_FIELD_CODES = frozenset({"policy_number"})
ENUM_FIELD_CODES = frozenset({"gender", "ward_class"})

_DATE_INPUT_PATTERNS = (
    "%Y-%m-%d",
    "%d/%m/%Y",
    "%d-%m-%Y",
    "%Y/%m/%d",
    "%d.%m.%Y",
)

_HKID_MASKED_RE = re.compile(r"^[A-Z]{1,2}[\d*]{6}\([0-9A*]\)$")
_HKID_FULL_RE = re.compile(r"^([A-Z]{1,2})(\d{6})\(([0-9A])\)$")
_POLICY_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9\-_/]{4,29}$")
_ICD10_RE = re.compile(r"^[A-Z]\d{2}(\.\d{1,2})?$", re.IGNORECASE)
_CPT_RE = re.compile(r"^\d{5}$")

_ENUM_OPTIONS: dict[str, frozenset[str]] = {
    "gender": frozenset({"Male", "Female"}),
    "ward_class": frozenset({"Private", "Semi-private", "Standard", "ICU", "Day"}),
}


def _copy_field(
    field: ExtractedFieldValue | dict[str, Any],
    *,
    value: str | None = None,
    status: FieldExtractionStatus | None = None,
    validation_error: str | None = None,
) -> dict[str, Any]:
    if isinstance(field, ExtractedFieldValue):
        base = field.model_dump()
    else:
        base = dict(field)
    if value is not None:
        base["value"] = value
    if status is not None:
        base["status"] = status
    base["validation_error"] = validation_error
    return base


def _fail(
    field: ExtractedFieldValue | dict[str, Any],
    error: str,
) -> dict[str, Any]:
    return _copy_field(field, status="low_confidence", validation_error=error)


def _pass(
    field: ExtractedFieldValue | dict[str, Any],
    *,
    value: str | None = None,
) -> dict[str, Any]:
    return _copy_field(field, value=value if value is not None else _field_value(field), validation_error=None)


def _field_value(field: ExtractedFieldValue | dict[str, Any]) -> str | None:
    if isinstance(field, ExtractedFieldValue):
        return field.value
    value = field.get("value")
    return None if value is None else str(value).strip() or None


def _field_status(field: ExtractedFieldValue | dict[str, Any]) -> str:
    if isinstance(field, ExtractedFieldValue):
        return field.status
    return str(field.get("status") or "missing")


def _should_skip_validation(field: ExtractedFieldValue | dict[str, Any]) -> bool:
    status = _field_status(field)
    value = _field_value(field)
    return status == "missing" or value is None


def normalize_date_value(value: str) -> tuple[str | None, str | None]:
    text = value.strip()
    for pattern in _DATE_INPUT_PATTERNS:
        try:
            parsed = datetime.strptime(text, pattern)
            return parsed.strftime("%Y-%m-%d"), None
        except ValueError:
            continue
    return None, "日期格式无效，无法解析为 YYYY-MM-DD"


def _hkid_check_digit(prefix: str, digits: str) -> str:
    weights = [9, 8, 7, 6, 5, 4, 3, 2]
    if len(prefix) == 1:
        chars = [prefix, " ", *digits]
    else:
        chars = [*prefix, *digits]
    values = [ord(ch) - 55 if ch != " " else 36 for ch in chars]
    total = sum(v * w for v, w in zip(values, weights, strict=False))
    remainder = total % 11
    check = 11 - remainder
    if check == 10:
        return "A"
    if check == 11:
        return "0"
    return str(check)


def validate_hkid_value(value: str) -> tuple[str | None, str | None]:
    text = value.strip().upper().replace(" ", "")
    if "*" in text:
        if _HKID_MASKED_RE.match(text):
            return text, None
        return None, "香港身份证号打码格式不正确"

    match = _HKID_FULL_RE.match(text)
    if not match:
        return None, "香港身份证号格式不正确"

    prefix, digits, check = match.groups()
    expected = _hkid_check_digit(prefix, digits)
    if check != expected:
        return None, "香港身份证号校验位不正确"
    return text, None


def normalize_amount_value(value: str) -> tuple[str | None, str | None]:
    text = value.strip()
    cleaned = (
        text.replace("HK$", "")
        .replace("HKD", "")
        .replace("$", "")
        .replace(",", "")
        .strip()
    )
    if not cleaned:
        return None, "金额不能为空"
    try:
        amount = float(cleaned)
    except ValueError:
        return None, "金额不是合法数字"
    if amount < 0:
        return None, "金额不能为负数"
    if amount.is_integer():
        return str(int(amount)), None
    return f"{amount:.2f}".rstrip("0").rstrip("."), None


def validate_policy_number_value(value: str) -> tuple[str | None, str | None]:
    text = value.strip()
    if _POLICY_RE.match(text):
        return text, None
    return None, "保单号格式不符合通用规则"


def validate_enum_value(value: str, *, field_code: str) -> tuple[str | None, str | None]:
    allowed = _ENUM_OPTIONS.get(field_code)
    if not allowed:
        return value, None
    if value in allowed:
        return value, None
    return None, f"枚举值不在允许范围内: {', '.join(sorted(allowed))}"


def validate_icd10_value(value: str) -> tuple[str | None, str | None]:
    text = value.strip().upper()
    if _ICD10_RE.match(text):
        return text, None
    return None, "ICD-10 编码格式不正确"


def validate_cpt_value(value: str) -> tuple[str | None, str | None]:
    text = value.strip()
    if _CPT_RE.match(text):
        return text, None
    return None, "CPT 编码格式不正确"


def validate_field(
    field_code: str,
    field: ExtractedFieldValue | dict[str, Any],
    *,
    enum_options: dict[str, frozenset[str]] | None = None,
) -> dict[str, Any]:
    if _should_skip_validation(field):
        return _copy_field(field, validation_error=None)

    value = _field_value(field)
    assert value is not None

    if field_code in DATE_FIELD_CODES:
        normalized, error = normalize_date_value(value)
        if error:
            return _fail(field, error)
        return _pass(field, value=normalized)

    if field_code == "hkid":
        normalized, error = validate_hkid_value(value)
        if error:
            return _fail(field, error)
        return _pass(field, value=normalized)

    if field_code in AMOUNT_FIELD_CODES:
        normalized, error = normalize_amount_value(value)
        if error:
            return _fail(field, error)
        return _pass(field, value=normalized)

    if field_code in POLICY_FIELD_CODES:
        normalized, error = validate_policy_number_value(value)
        if error:
            return _fail(field, error)
        return _pass(field, value=normalized)

    if field_code in ENUM_FIELD_CODES:
        options = enum_options or _ENUM_OPTIONS
        allowed = options.get(field_code)
        if allowed:
            normalized, error = validate_enum_value(value, field_code=field_code)
            if error:
                return _fail(field, error)
            return _pass(field, value=normalized)

    if field_code == "icd10":
        normalized, error = validate_icd10_value(value)
        if error:
            return _fail(field, error)
        return _pass(field, value=normalized)

    if field_code == "cpt":
        normalized, error = validate_cpt_value(value)
        if error:
            return _fail(field, error)
        return _pass(field, value=normalized)

    return _pass(field)


def validate_extracted_fields(
    fields: dict[str, ExtractedFieldValue | dict[str, Any]],
    *,
    enum_options: dict[str, frozenset[str]] | None = None,
) -> dict[str, dict[str, Any]]:
    return {
        field_code: validate_field(field_code, field_value, enum_options=enum_options)
        for field_code, field_value in fields.items()
    }
