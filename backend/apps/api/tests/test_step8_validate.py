"""Step8 Validation Engine 单测（纯本地逻辑，不调用 LLM）。"""
from src.modules.pdf_extraction.ai_service.field_extractor import ExtractedFieldValue
from src.modules.pdf_extraction.steps.step8_validate import (
    normalize_amount_value,
    normalize_date_value,
    validate_extracted_fields,
    validate_hkid_value,
)


def _field(value: str | None, status: str = "extracted", confidence: float = 0.9):
    return ExtractedFieldValue(
        value=value,
        status=status,  # type: ignore[arg-type]
        confidence=confidence,
    )


def test_normalize_date_value_to_iso():
    iso, error = normalize_date_value("10/01/2025")
    assert error is None
    assert iso == "2025-01-10"


def test_validate_hkid_accepts_masked():
    value, error = validate_hkid_value("A123***(*)")
    assert error is None
    assert value == "A123***(*)"


def test_validate_hkid_rejects_bad_check_digit():
    value, error = validate_hkid_value("A123456(0)")
    assert value is None
    assert error is not None


def test_normalize_amount_value_strips_currency():
    value, error = normalize_amount_value("HK$1,234.50")
    assert error is None
    assert value == "1234.5"


def test_validate_extracted_fields_marks_invalid_date():
    result = validate_extracted_fields(
        {"dob": _field("not-a-date")},
    )
    assert result["dob"]["status"] == "low_confidence"
    assert result["dob"]["validation_error"] is not None


def test_validate_extracted_fields_skips_missing():
    result = validate_extracted_fields(
        {"dob": _field(None, status="missing", confidence=0.0)},
    )
    assert result["dob"]["status"] == "missing"
    assert result["dob"]["validation_error"] is None


def test_validate_extracted_fields_normalizes_valid_policy_number():
    result = validate_extracted_fields(
        {"policy_number": _field("AIA-12345/01")},
    )
    assert result["policy_number"]["status"] == "extracted"
    assert result["policy_number"]["validation_error"] is None
