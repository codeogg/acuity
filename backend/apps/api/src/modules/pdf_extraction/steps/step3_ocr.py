"""Step3：OCR 识别（PaddleOCR，无大模型）。

对 ocr_required 页面调用 OCR；text_layer 页面转为 blocks（confidence=1.0）。
"""
from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable

from src.config import settings
from src.modules.pdf_extraction.ocr_service import IOcrEngine, OcrBlock
from src.modules.pdf_extraction.ocr_service.engine_pool import OcrEnginePool
from src.modules.pdf_extraction.ocr_service.parser import text_layer_to_blocks
from src.modules.pdf_extraction.schemas import (
    OcrBlockOut,
    Step3OcrInput,
    Step3OcrOutput,
    Step3PageOcrOutput,
    Step3PageSourceInput,
)


def recognize_page(
    page: Step3PageSourceInput,
    *,
    task_id: str,
    engine: IOcrEngine,
    download_image: Callable[[str], bytes],
) -> Step3PageOcrOutput:
    if page.source == "text_layer":
        blocks = text_layer_to_blocks(page.text or "")
    else:
        if not page.image_path:
            blocks = []
        else:
            image_bytes = download_image(page.image_path)
            blocks = engine.recognize_image(image_bytes)

    return Step3PageOcrOutput(
        task_id=task_id,
        page=page.page,
        blocks=[OcrBlockOut.model_validate(b.model_dump()) for b in blocks],
    )


def run_step3_ocr(
    data: Step3OcrInput,
    *,
    engine: IOcrEngine,
    download_image: Callable[[str], bytes],
) -> Step3OcrOutput:
    """同步串行 OCR（单测 / Mock 引擎使用）。"""
    pages: list[Step3PageOcrOutput] = []
    ocr_page_count = 0
    text_layer_page_count = 0
    total_blocks = 0

    for page in sorted(data.pages, key=lambda p: p.page):
        result = recognize_page(
            page, task_id=data.task_id, engine=engine, download_image=download_image
        )
        pages.append(result)
        total_blocks += len(result.blocks)
        if page.source == "ocr_required":
            ocr_page_count += 1
        else:
            text_layer_page_count += 1

    return Step3OcrOutput(
        task_id=data.task_id,
        status="CLASSIFYING",
        page_count=len(pages),
        ocr_page_count=ocr_page_count,
        text_layer_page_count=text_layer_page_count,
        total_blocks=total_blocks,
        pages=pages,
    )


async def run_step3_ocr_async(
    data: Step3OcrInput,
    *,
    pool: OcrEnginePool,
    download_image: Callable[[str], bytes] | Callable[[str], Awaitable[bytes]],
    page_concurrency: int | None = None,
) -> Step3OcrOutput:
    """实例池 + 任务内多页并行 OCR（Semaphore 限制单任务并发）。"""
    limit = page_concurrency if page_concurrency is not None else settings.OCR_PAGE_CONCURRENCY
    sem = asyncio.Semaphore(max(1, limit))

    async def _download(path: str) -> bytes:
        if asyncio.iscoroutinefunction(download_image):
            return await download_image(path)
        return await asyncio.to_thread(download_image, path)

    async def _process_page(page: Step3PageSourceInput) -> Step3PageOcrOutput:
        async with sem:
            if page.source == "text_layer":
                blocks = text_layer_to_blocks(page.text or "")
            elif not page.image_path:
                blocks: list[OcrBlock] = []
            else:
                image_bytes = await _download(page.image_path)
                blocks = await pool.acquire_and_run(image_bytes)
            return Step3PageOcrOutput(
                task_id=data.task_id,
                page=page.page,
                blocks=[OcrBlockOut.model_validate(b.model_dump()) for b in blocks],
            )

    page_results = await asyncio.gather(
        *[_process_page(page) for page in sorted(data.pages, key=lambda p: p.page)]
    )

    ocr_page_count = sum(1 for p in data.pages if p.source == "ocr_required")
    text_layer_page_count = sum(1 for p in data.pages if p.source != "ocr_required")
    total_blocks = sum(len(page.blocks) for page in page_results)

    return Step3OcrOutput(
        task_id=data.task_id,
        status="CLASSIFYING",
        page_count=len(page_results),
        ocr_page_count=ocr_page_count,
        text_layer_page_count=text_layer_page_count,
        total_blocks=total_blocks,
        pages=list(page_results),
    )
