"""医生预设界面语言（与前端 next-intl locales 对齐）。"""
from __future__ import annotations

from typing import Literal

from src.core.exceptions import ValidationException

UiLanguage = Literal["zh-Hant-HK", "en-HK"]

SUPPORTED_UI_LANGUAGES: frozenset[str] = frozenset({"zh-Hant-HK", "en-HK"})
DEFAULT_UI_LANGUAGE: UiLanguage = "zh-Hant-HK"


def normalize_ui_language(value: str | None) -> UiLanguage:
    """将请求/存量值收敛为前端路由 locale；空值回退默认。"""
    if not value or not str(value).strip():
        return DEFAULT_UI_LANGUAGE
    lowered = str(value).strip().replace("_", "-").lower()
    if lowered in {"en", "en-hk"} or lowered.startswith("en-"):
        return "en-HK"
    if lowered in {"zh", "zh-hk", "zh-hant", "zh-hant-hk"} or lowered.startswith("zh-"):
        return "zh-Hant-HK"
    raise ValidationException("界面语言仅支持 zh-Hant-HK 或 en-HK")


def validate_ui_language(value: str) -> UiLanguage:
    if not value or not str(value).strip():
        raise ValidationException("界面语言不能为空")
    return normalize_ui_language(value)
