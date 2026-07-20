"""OCR 实例池预热：进程启动时初始化池 + 可选推理热身，避免首个任务卡在模型加载。"""
from __future__ import annotations

import time

from src.config import settings
from src.core.logging import get_logger
from src.modules.pdf_extraction.ocr_service.engine_pool import get_ocr_pool

logger = get_logger(__name__)

def _make_warmup_png() -> bytes:
    """生成一张可被 PaddleOCR 读取的极小白底图，用于推理热身。"""
    import fitz

    doc = fitz.open()
    page = doc.new_page(width=64, height=32)
    page.insert_text((4, 20), "warmup", fontsize=8)
    return page.get_pixmap(alpha=False).tobytes("png")


async def warmup_ocr_pool() -> None:
    """初始化 OCR 池，并可选执行一次推理热身。"""
    start = time.perf_counter()
    try:
        pool = get_ocr_pool()
        await pool.initialize()
        init_ms = int((time.perf_counter() - start) * 1000)

        infer_ms = 0
        if settings.OCR_WARMUP_INFERENCE:
            infer_start = time.perf_counter()
            await pool.acquire_and_run(_make_warmup_png())
            infer_ms = int((time.perf_counter() - infer_start) * 1000)

        logger.info(
            "ocr_pool_warmup_done",
            init_ms=init_ms,
            infer_ms=infer_ms,
            warmup_size=settings.OCR_POOL_WARMUP_SIZE,
            pool_size=settings.OCR_POOL_SIZE,
        )
    except Exception as exc:
        logger.warning("ocr_pool_warmup_failed", error=str(exc))


def warmup_ocr_engine() -> None:
    """同步入口（供无法在 async 上下文调用的场景）；优先使用 warmup_ocr_pool。"""
    import asyncio

    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        asyncio.run(warmup_ocr_pool())
        return
    loop.create_task(warmup_ocr_pool())
