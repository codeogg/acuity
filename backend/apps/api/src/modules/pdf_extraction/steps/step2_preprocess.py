"""Step2：PDF 预处理（本地 PyMuPDF，无 AI）。

逐页判断文本层 vs 扫描件，扫描页按 200 DPI 转 PNG。
"""
from __future__ import annotations

import fitz

from src.modules.pdf_extraction.schemas import (
    PageSource,
    Step2PageOutput,
    Step2PreprocessInput,
    Step2PreprocessOutput,
)
from src.utils import storage

MIN_TEXT_CHARS = 20
RENDER_DPI = 200


def has_substantial_text(text: str, *, min_chars: int = MIN_TEXT_CHARS) -> bool:
    """判断页面是否含有可提取的实质文本（非空白）。"""
    compact = "".join(text.split())
    return len(compact) >= min_chars


def _render_page_png(page: fitz.Page) -> bytes:
    scale = RENDER_DPI / 72.0
    matrix = fitz.Matrix(scale, scale)
    pixmap = page.get_pixmap(matrix=matrix, alpha=False)
    return pixmap.tobytes("png")


def preprocess_pdf_bytes(
    pdf_bytes: bytes,
    data: Step2PreprocessInput,
) -> list[Step2PageOutput]:
    """独立可测：解析 PDF 字节流，返回每页预处理结果（含存储扫描页图片）。"""
    pages: list[Step2PageOutput] = []
    with fitz.open(stream=pdf_bytes, filetype="pdf") as doc:
        if doc.page_count == 0:
            return pages

        for index in range(doc.page_count):
            page_no = index + 1
            page = doc.load_page(index)
            text = page.get_text("text")

            if has_substantial_text(text):
                pages.append(
                    Step2PageOutput(
                        task_id=data.task_id,
                        page=page_no,
                        source="text_layer",
                        text=text.strip(),
                        image_path=None,
                    )
                )
                continue

            image_key = (
                f"medical-records/{data.clinic_id}/{data.task_id}/pages/page-{page_no}.png"
            )
            png_bytes = _render_page_png(page)
            image_url = storage.upload_bytes(
                png_bytes, image_key, content_type="image/png"
            )
            pages.append(
                Step2PageOutput(
                    task_id=data.task_id,
                    page=page_no,
                    source="ocr_required",
                    text=None,
                    image_path=image_url,
                )
            )

    return pages


def preprocess_pdf_mineru_placeholder(
    pdf_bytes: bytes,
    data: Step2PreprocessInput,
) -> list[Step2PageOutput]:
    """MinerU 模式：仅记录页数，不做逐页 PNG 渲染（整 PDF 交给 MinerU）。"""
    pages: list[Step2PageOutput] = []
    with fitz.open(stream=pdf_bytes, filetype="pdf") as doc:
        for index in range(doc.page_count):
            pages.append(
                Step2PageOutput(
                    task_id=data.task_id,
                    page=index + 1,
                    source="text_layer",
                    text=None,
                    image_path=None,
                )
            )
    return pages


def build_step2_output(
    data: Step2PreprocessInput, pages: list[Step2PageOutput]
) -> Step2PreprocessOutput:
    text_layer_count = sum(1 for p in pages if p.source == "text_layer")
    ocr_required_count = sum(1 for p in pages if p.source == "ocr_required")
    return Step2PreprocessOutput(
        task_id=data.task_id,
        status="OCR",
        page_count=len(pages),
        text_layer_count=text_layer_count,
        ocr_required_count=ocr_required_count,
        pages=pages,
    )
