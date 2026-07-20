"""Step10：Insurance Mapper（本地映射，无 AI）。"""
from __future__ import annotations

from typing import Any

# 无模板配置时的保司字段别名（可按需扩展）
FALLBACK_INSURANCE_MAPPINGS: dict[str, dict[str, str]] = {
    "AIA": {
        "patient_name_cn": "insured_name",
        "patient_name_en": "insured_name_en",
        "diagnosis_text": "diagnosis_desc",
        "policy_number": "policy_no",
        "amount_total": "claim_amount",
        "admission_date": "admission_date",
        "discharge_date": "discharge_date",
    },
    "AXA": {
        "patient_name_cn": "claimant_name",
        "patient_name_en": "claimant_name_en",
        "diagnosis_text": "diagnosis",
        "policy_number": "policy_number",
        "amount_total": "total_amount",
    },
    "BUPA": {
        "patient_name_cn": "member_name",
        "patient_name_en": "member_name_en",
        "diagnosis_text": "diagnosis_detail",
        "policy_number": "membership_no",
        "amount_total": "total_claim_amount",
    },
}


def normalize_insurance_key(name: str | None) -> str:
    if not name:
        return "UNKNOWN"
    return name.strip().upper().replace(" ", "_")


def resolve_fallback_mapping(insurance_company: str | None) -> dict[str, str]:
    key = normalize_insurance_key(insurance_company)
    if key in FALLBACK_INSURANCE_MAPPINGS:
        return dict(FALLBACK_INSURANCE_MAPPINGS[key])
    for alias, mapping in FALLBACK_INSURANCE_MAPPINGS.items():
        if alias in key or key in alias:
            return dict(mapping)
    return {}


def map_fields_to_insurance(
    fields: dict[str, dict[str, Any]],
    field_mapping: dict[str, str],
    *,
    keep_unmapped: bool = True,
) -> tuple[dict[str, dict[str, Any]], list[str]]:
    """将标准字段映射为保司字段名，保留 source_field 溯源。"""
    mapped: dict[str, dict[str, Any]] = {}
    unmapped: list[str] = []

    for standard_code, field_value in fields.items():
        insurer_code = field_mapping.get(standard_code)
        if not insurer_code:
            unmapped.append(standard_code)
            if not keep_unmapped:
                continue
            insurer_code = standard_code

        payload = dict(field_value)
        payload["source_field"] = standard_code
        mapped[insurer_code] = payload

    return mapped, unmapped
