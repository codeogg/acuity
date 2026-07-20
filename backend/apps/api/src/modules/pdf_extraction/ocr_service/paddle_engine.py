"""PaddleOCR 3.x 引擎实现。"""
from __future__ import annotations

import tempfile
from pathlib import Path
from typing import Any

from src.config import settings
from src.core.exceptions import ValidationException
from src.modules.pdf_extraction.ocr_service import OcrBlock
from src.modules.pdf_extraction.ocr_service.parser import parse_paddle_result


def _create_paddle_client() -> Any:
    try:
        from paddleocr import PaddleOCR
    except ImportError as exc:
        raise ValidationException(
            "未安装 PaddleOCR，请执行：pip install -e \".[ocr]\""
        ) from exc

    try:
        return PaddleOCR(
            lang="ch",
            text_detection_model_name=settings.OCR_DET_MODEL_NAME,
            text_recognition_model_name=settings.OCR_REC_MODEL_NAME,
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
            use_textline_orientation=True,
        )
    except RuntimeError as exc:
        message = str(exc)
        if "paddlepaddle" in message.lower():
            raise ValidationException(
                "未安装 PaddlePaddle，请执行：pip install -e \".[ocr]\""
            ) from exc
        raise ValidationException(f"OCR 引擎初始化失败：{message}") from exc


def create_paddle_ocr_engine() -> PaddleOcrEngine:
    """创建已加载模型的独立 PaddleOCR 引擎实例（供实例池使用）。"""
    return PaddleOcrEngine(_create_paddle_client())


class PaddleOcrEngine:
    """基于 PaddleOCR 的 OCR 实现；每个实例绑定一个 PaddleOCR 客户端。"""

    def __init__(self, client: Any | None = None) -> None:
        self._ocr = client if client is not None else _create_paddle_client()

    def recognize_image(self, image_bytes: bytes) -> list[OcrBlock]:
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
            tmp.write(image_bytes)
            tmp_path = tmp.name

        try:
            result = self._run_predict(self._ocr, tmp_path)
            blocks: list[OcrBlock] = []
            for item in result or []:
                blocks.extend(parse_paddle_result(item))
            return blocks
        finally:
            Path(tmp_path).unlink(missing_ok=True)

    def _run_predict(self, ocr: Any, image_path: str):
        if hasattr(ocr, "predict"):
            return ocr.predict(input=image_path)
        if hasattr(ocr, "ocr"):
            return ocr.ocr(image_path, cls=True)
        raise ValidationException("当前 PaddleOCR 版本不支持 predict/ocr 接口")
