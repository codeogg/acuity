"""confirm 字段扁平化测试。"""
from src.modules.claims.service import _flatten_field_values


def test_flatten_already_flat():
    assert _flatten_field_values({"a": "1", "b": None}) == {"a": "1", "b": None}


def test_flatten_rich_structure():
    rich = {
        "patient_name_cn": {"value": "陈大文", "status": "extracted", "confidence": 0.9},
        "diagnosis": {"value": None, "status": "missing"},
    }
    assert _flatten_field_values(rich) == {
        "patient_name_cn": "陈大文",
        "diagnosis": None,
    }
