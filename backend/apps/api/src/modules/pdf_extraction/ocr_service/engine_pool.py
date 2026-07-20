"""PaddleOCR 实例池：进程内复用 N 个独立实例，避免并发共用同一引擎。"""
from __future__ import annotations

import asyncio
import os
from collections.abc import Callable
from typing import TYPE_CHECKING

from src.config import settings
from src.core.logging import get_logger
from src.modules.pdf_extraction.ocr_service import OcrBlock

if TYPE_CHECKING:
    from src.modules.pdf_extraction.ocr_service.paddle_engine import PaddleOcrEngine

logger = get_logger(__name__)

EngineFactory = Callable[[], "PaddleOcrEngine"]

_pool: OcrEnginePool | None = None


class OcrEnginePool:
    """asyncio.Queue 管理的 PaddleOCR 实例池。"""

    def __init__(
        self,
        *,
        pool_size: int | None = None,
        engine_factory: EngineFactory | None = None,
    ) -> None:
        self._pool_size = pool_size if pool_size is not None else settings.OCR_POOL_SIZE
        self._engine_factory = engine_factory
        self._queue: asyncio.Queue[PaddleOcrEngine] | None = None
        self._initialized = False
        self._init_lock = asyncio.Lock()
        self._grow_lock = asyncio.Lock()
        self._created_count = 0

    def _resolve_factory(self) -> EngineFactory:
        if self._engine_factory is not None:
            return self._engine_factory
        from src.modules.pdf_extraction.ocr_service.paddle_engine import (
            create_paddle_ocr_engine,
        )

        return create_paddle_ocr_engine

    def _create_engine_blocking(self) -> PaddleOcrEngine:
        os.environ.setdefault("PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK", "True")
        return self._resolve_factory()()

    def _create_engines_blocking(self, count: int) -> list[PaddleOcrEngine]:
        logger.info("ocr_pool_creating_engines", count=count, pool_size=self._pool_size)
        return [self._create_engine_blocking() for _ in range(count)]

    async def _grow_one(self) -> None:
        """按需追加一个引擎（不超过 pool_size）。"""
        if self._queue is None or self._created_count >= self._pool_size:
            return
        async with self._grow_lock:
            if self._created_count >= self._pool_size:
                return
            engine = await asyncio.to_thread(self._create_engine_blocking)
            await self._queue.put(engine)
            self._created_count += 1
            logger.info(
                "ocr_pool_engine_added",
                created_count=self._created_count,
                pool_size=self._pool_size,
            )

    async def initialize(self) -> None:
        """创建 warmup_size 个引擎并入队；其余在并发高峰时懒加载。"""
        if self._initialized:
            return
        async with self._init_lock:
            if self._initialized:
                return
            warmup_size = max(1, min(settings.OCR_POOL_WARMUP_SIZE, self._pool_size))
            engines = await asyncio.to_thread(self._create_engines_blocking, warmup_size)
            queue: asyncio.Queue[PaddleOcrEngine] = asyncio.Queue()
            for engine in engines:
                await queue.put(engine)
            self._queue = queue
            self._created_count = warmup_size
            self._initialized = True
            logger.info(
                "ocr_pool_initialized",
                warmup_size=warmup_size,
                pool_size=self._pool_size,
            )

    async def acquire_and_run(self, image_bytes: bytes) -> list[OcrBlock]:
        """借出一个空闲实例执行 OCR，完成后归还，保证实例不被并发共用。"""
        if not self._initialized or self._queue is None:
            await self.initialize()
        assert self._queue is not None

        try:
            engine = self._queue.get_nowait()
        except asyncio.QueueEmpty:
            if self._created_count < self._pool_size:
                await self._grow_one()
                try:
                    engine = self._queue.get_nowait()
                except asyncio.QueueEmpty:
                    engine = await self._queue.get()
            else:
                engine = await self._queue.get()

        try:
            return await asyncio.to_thread(engine.recognize_image, image_bytes)
        finally:
            await self._queue.put(engine)


def get_ocr_pool() -> OcrEnginePool:
    global _pool
    if _pool is None:
        _pool = OcrEnginePool()
    return _pool


def reset_ocr_pool() -> None:
    """测试或进程重置时清空全局池。"""
    global _pool
    _pool = None
