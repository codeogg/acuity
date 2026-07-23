"""医生设置：界面语言与闲置锁屏校验。"""

import pytest

from src.core.exceptions import ValidationException
from src.core.idle_lock import validate_idle_lock_minutes
from src.core.ui_language import (
    DEFAULT_UI_LANGUAGE,
    normalize_ui_language,
    validate_ui_language,
)
from src.modules.doctor_settings.service import resolve_ui_language


class _Doctor:
    def __init__(self, language: str | None = None) -> None:
        self.language = language


def test_normalize_ui_language_aliases() -> None:
    assert normalize_ui_language(None) == DEFAULT_UI_LANGUAGE
    assert normalize_ui_language("zh-Hant-HK") == "zh-Hant-HK"
    assert normalize_ui_language("zh-HK") == "zh-Hant-HK"
    assert normalize_ui_language("en-HK") == "en-HK"
    assert normalize_ui_language("en") == "en-HK"


def test_validate_ui_language_rejects_empty_and_unknown() -> None:
    with pytest.raises(ValidationException):
        validate_ui_language("")
    with pytest.raises(ValidationException):
        validate_ui_language("fr-FR")


def test_validate_idle_lock_minutes_bounds() -> None:
    assert validate_idle_lock_minutes(2) == 2
    assert validate_idle_lock_minutes(30) == 30
    with pytest.raises(ValidationException):
        validate_idle_lock_minutes(1)
    with pytest.raises(ValidationException):
        validate_idle_lock_minutes(31)


def test_resolve_ui_language_fallback() -> None:
    assert resolve_ui_language(_Doctor("en-HK")) == "en-HK"
    assert resolve_ui_language(_Doctor(None)) == DEFAULT_UI_LANGUAGE
    assert resolve_ui_language(_Doctor("not-a-locale")) == DEFAULT_UI_LANGUAGE


def test_validate_signature_url_rejects_data_url() -> None:
    from src.modules.doctor_settings.service import _validate_signature_url

    assert _validate_signature_url(None) is None
    assert _validate_signature_url("/local-storage/signatures/1/a.png") == (
        "/local-storage/signatures/1/a.png"
    )
    with pytest.raises(ValidationException):
        _validate_signature_url("data:image/png;base64,abc")
