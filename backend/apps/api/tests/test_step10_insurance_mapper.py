"""Step10 Insurance Mapper 单测（纯本地逻辑，不调用 LLM）。"""
from src.modules.pdf_extraction.steps.step10_insurance_mapper import (
    map_fields_to_insurance,
    normalize_insurance_key,
    resolve_fallback_mapping,
)


def test_resolve_fallback_mapping_for_aia():
    mapping = resolve_fallback_mapping("AIA")
    assert mapping["diagnosis_text"] == "diagnosis_desc"
    assert mapping["patient_name_cn"] == "insured_name"


def test_map_fields_to_insurance_renames_and_traces_source():
    mapped, unmapped = map_fields_to_insurance(
        {
            "patient_name_cn": {
                "value": "陈大文",
                "status": "extracted",
                "confidence": 0.95,
                "validation_error": None,
            },
            "hkid": {
                "value": None,
                "status": "missing",
                "confidence": 0.0,
                "validation_error": None,
            },
        },
        {"patient_name_cn": "insured_name"},
        keep_unmapped=True,
    )
    assert "insured_name" in mapped
    assert mapped["insured_name"]["source_field"] == "patient_name_cn"
    assert mapped["insured_name"]["value"] == "陈大文"
    assert "hkid" in mapped
    assert "hkid" in unmapped


def test_map_fields_to_insurance_can_drop_unmapped():
    mapped, unmapped = map_fields_to_insurance(
        {
            "hkid": {
                "value": None,
                "status": "missing",
                "confidence": 0.0,
                "validation_error": None,
            }
        },
        {},
        keep_unmapped=False,
    )
    assert mapped == {}
    assert unmapped == ["hkid"]


def test_normalize_insurance_key():
    assert normalize_insurance_key("  aia  ") == "AIA"
