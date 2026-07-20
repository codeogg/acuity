"""可提取字段规格：标准字段与模板专属 AI 字段共用同一形状。"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol, runtime_checkable


@runtime_checkable
class ExtractableField(Protocol):
    field_code: str
    field_name: str
    data_type: str
    ai_extraction_hint: str | None
    enum_options: list | None


@dataclass(frozen=True)
class ExtractableFieldSpec:
    field_code: str
    field_name: str
    data_type: str = "text"
    ai_extraction_hint: str | None = None
    enum_options: list | None = None
