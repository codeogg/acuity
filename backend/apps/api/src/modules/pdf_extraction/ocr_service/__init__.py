"""OCR 引擎抽象与 PaddleOCR 实现（Step3，无大模型）。"""
from __future__ import annotations

from typing import Protocol

from pydantic import BaseModel, Field


class OcrBlock(BaseModel):
    text: str
    bbox: list[float] | None = Field(
        default=None, description="[x1, y1, x2, y2]；文本层页面可为 null"
    )
    confidence: float = Field(ge=0.0, le=1.0)


class IOcrEngine(Protocol):
    """OCR 引擎可替换接口（默认 PaddleOCR，测试可注入 Mock）。"""

    def recognize_image(self, image_bytes: bytes) -> list[OcrBlock]: ...


_engine: IOcrEngine | None = None


def get_ocr_engine() -> IOcrEngine:
    global _engine
    if _engine is None:
        from src.modules.pdf_extraction.ocr_service.paddle_engine import PaddleOcrEngine

        _engine = PaddleOcrEngine()
    return _engine


def set_ocr_engine(engine: IOcrEngine | None) -> None:
    """测试或切换引擎时注入实现。"""
    global _engine
    _engine = engine
