"""Step11：输出标准 JSON 并供人工审核（本地逻辑，无 AI）。"""
from __future__ import annotations

from typing import Any

REVIEW_CONFIDENCE_THRESHOLD = 0.7


def needs_review_highlight(field: dict[str, Any]) -> bool:
    """confidence < 0.7 或 status != extracted 时需前端标黄。"""
    status = field.get("status")
    confidence = float(field.get("confidence") or 0.0)
    return status != "extracted" or confidence < REVIEW_CONFIDENCE_THRESHOLD


def _normalize_text(text: str) -> str:
    return " ".join(text.strip().lower().split())


def _score_text_match(needle: str, haystack: str) -> float:
    n = _normalize_text(needle)
    h = _normalize_text(haystack)
    if not n or not h:
        return 0.0
    if n == h:
        return 1.0
    if n in h:
        return max(0.5, len(n) / len(h))
    if h in n:
        return max(0.5, len(h) / len(n))
    return 0.0


def find_ocr_provenance(
    value: str | None,
    *,
    ocr_pages: list[dict[str, Any]],
    text_layer_pages: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """在 OCR blocks / 文本层中匹配字段值，返回 page/bbox/source_text。"""
    if not value or not str(value).strip():
        return {"page": None, "bbox": None, "source_text": None}

    best_score = 0.0
    best: dict[str, Any] = {"page": None, "bbox": None, "source_text": None}

    for page_row in ocr_pages:
        page_no = page_row["page"]
        for block in page_row.get("blocks") or []:
            text = block.get("text") or ""
            score = _score_text_match(value, text)
            if score > best_score:
                best_score = score
                best = {
                    "page": page_no,
                    "bbox": block.get("bbox"),
                    "source_text": text,
                }

    for page_row in text_layer_pages or []:
        page_no = page_row["page"]
        text = page_row.get("text") or ""
        for line in text.splitlines():
            line = line.strip()
            if not line:
                continue
            score = _score_text_match(value, line)
            if score > best_score:
                best_score = score
                best = {
                    "page": page_no,
                    "bbox": None,
                    "source_text": line,
                }

    if best_score < 0.3:
        return {"page": None, "bbox": None, "source_text": None}
    return best


def attach_field_provenance(
    fields: dict[str, dict[str, Any]],
    *,
    ocr_pages: list[dict[str, Any]],
    text_layer_pages: list[dict[str, Any]] | None = None,
) -> dict[str, dict[str, Any]]:
    """为标准字段附加 page/bbox/source_text 溯源信息。"""
    enriched: dict[str, dict[str, Any]] = {}
    for code, field in fields.items():
        payload = dict(field)
        provenance = find_ocr_provenance(
            payload.get("value"),
            ocr_pages=ocr_pages,
            text_layer_pages=text_layer_pages,
        )
        payload.update(provenance)
        enriched[code] = payload
    return enriched


def _missing_review_field() -> dict[str, Any]:
    return {
        "value": None,
        "status": "missing",
        "confidence": 0.0,
        "validation_error": None,
        "page": None,
        "bbox": None,
        "source_text": None,
    }


def complete_standard_review_fields(
    fields: dict[str, dict[str, Any]],
    *,
    standard_field_codes: list[str] | None = None,
    system_values: dict[str, str | None] | None = None,
) -> dict[str, dict[str, Any]]:
    """按标准字段全集补齐审核字段；系统字段有值时直接填入。"""
    system_values = system_values or {}
    ordered_codes = list(standard_field_codes or [])
    extra_codes = [code for code in fields if code not in set(ordered_codes)]
    completed: dict[str, dict[str, Any]] = {}

    for code in [*ordered_codes, *extra_codes]:
        payload = dict(fields.get(code) or _missing_review_field())
        value = payload.get("value")
        system_value = system_values.get(code)
        if (value is None or str(value).strip() == "") and system_value:
            payload["value"] = system_value
            payload["status"] = "extracted"
            payload["confidence"] = 1.0
            payload["validation_error"] = None
        else:
            payload.setdefault("value", None)
            payload.setdefault("status", "missing")
            payload.setdefault("confidence", 0.0)
            payload.setdefault("validation_error", None)
        payload.setdefault("page", None)
        payload.setdefault("bbox", None)
        payload.setdefault("source_text", None)
        completed[code] = payload

    return completed


def build_standard_review_fields(
    extraction_fields: dict[str, dict[str, Any]],
    *,
    ocr_pages: list[dict[str, Any]],
    text_layer_pages: list[dict[str, Any]] | None = None,
    standard_field_codes: list[str] | None = None,
    system_values: dict[str, str | None] | None = None,
) -> dict[str, dict[str, Any]]:
    return attach_field_provenance(
        complete_standard_review_fields(
            extraction_fields,
            standard_field_codes=standard_field_codes,
            system_values=system_values,
        ),
        ocr_pages=ocr_pages,
        text_layer_pages=text_layer_pages,
    )


def merge_review_fields_for_display(
    prepared_fields: dict[str, dict[str, Any]],
    edited_fields: dict[str, dict[str, Any]] | None,
) -> dict[str, dict[str, Any]]:
    """展示时以医生编辑覆盖 prepared 中的 value/status/confidence。"""
    if not edited_fields:
        return {code: dict(field) for code, field in prepared_fields.items()}

    merged: dict[str, dict[str, Any]] = {}
    for code, prepared in prepared_fields.items():
        merged[code] = dict(prepared)
        if code in edited_fields:
            edit = edited_fields[code]
            if "value" in edit:
                merged[code]["value"] = edit.get("value")
            if "status" in edit:
                merged[code]["status"] = edit.get("status")
            if "confidence" in edit:
                merged[code]["confidence"] = edit.get("confidence")
    return merged


def apply_doctor_field_edits(
    prepared_fields: dict[str, dict[str, Any]],
    edits: dict[str, dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    """保存医生修改：更新 value，人工填写缺失字段视为 extracted。"""
    updated: dict[str, dict[str, Any]] = {}
    for code, edit in edits.items():
        if code not in prepared_fields:
            continue
        base = dict(prepared_fields[code])
        new_value = edit.get("value")
        if isinstance(new_value, str):
            new_value = new_value.strip() or None
        base["value"] = new_value

        if new_value:
            base["status"] = "extracted"
            base["confidence"] = 1.0
            base["validation_error"] = None
        elif base.get("status") == "extracted":
            base["status"] = "missing"
            base["confidence"] = 0.0

        updated[code] = {
            "value": base["value"],
            "status": base["status"],
            "confidence": base["confidence"],
        }
    return updated
