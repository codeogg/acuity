"""Step9 Missing Detector 单测（纯本地逻辑，不调用 LLM）。"""
from src.modules.pdf_extraction.steps.step9_detect_missing import (
    detect_missing_fields,
    is_empty_value,
    normalize_field_missing_state,
)


def test_is_empty_value_recognizes_placeholders():
    assert is_empty_value(None) is True
    assert is_empty_value("") is True
    assert is_empty_value("N/A") is True
    assert is_empty_value("不详") is True
    assert is_empty_value("CHAN TAI MAN") is False


def test_normalize_field_missing_state_forces_missing():
    result = normalize_field_missing_state(
        {
            "value": "  ",
            "status": "extracted",
            "confidence": 0.95,
            "validation_error": None,
        }
    )
    assert result["status"] == "missing"
    assert result["value"] is None
    assert result["confidence"] == 0.0


def test_detect_missing_fields_fills_schema_gaps():
    result = detect_missing_fields(
        {
            "diagnosis_text": {
                "value": "URI",
                "status": "extracted",
                "confidence": 0.9,
                "validation_error": None,
            }
        },
        ["diagnosis_text", "hkid", "dob"],
    )
    assert result["diagnosis_text"]["status"] == "extracted"
    assert result["hkid"]["status"] == "missing"
    assert result["dob"]["status"] == "missing"


def test_detect_missing_fields_converts_na_to_missing():
    result = detect_missing_fields(
        {
            "patient_name_cn": {
                "value": "N/A",
                "status": "extracted",
                "confidence": 0.8,
                "validation_error": None,
            }
        },
        ["patient_name_cn"],
    )
    assert result["patient_name_cn"]["status"] == "missing"
    assert result["patient_name_cn"]["value"] is None
