"""OCR 实例池单测。"""
import asyncio

import pytest

from src.modules.pdf_extraction.ocr_service import OcrBlock
from src.modules.pdf_extraction.ocr_service.engine_pool import OcrEnginePool, reset_ocr_pool
from src.modules.pdf_extraction.schemas import Step3OcrInput, Step3PageSourceInput
from src.modules.pdf_extraction.steps.step3_ocr import run_step3_ocr_async


class _FakeEngine:
    def __init__(self, engine_id: int) -> None:
        self.engine_id = engine_id
        self.in_use = False
        self.max_concurrent = 0
        self._concurrent = 0

    def recognize_image(self, image_bytes: bytes) -> list[OcrBlock]:
        self._concurrent += 1
        self.max_concurrent = max(self.max_concurrent, self._concurrent)
        try:
            assert not self.in_use
            self.in_use = True
            assert image_bytes.startswith(b"\x89PNG")
            return [OcrBlock(text=f"e{self.engine_id}", confidence=0.9)]
        finally:
            self.in_use = False
            self._concurrent -= 1


@pytest.fixture(autouse=True)
def _reset_pool():
    reset_ocr_pool()
    yield
    reset_ocr_pool()


def test_pool_initialize_and_acquire():
    counter = {"n": 0}

    def factory():
        counter["n"] += 1
        return _FakeEngine(counter["n"])

    async def _run():
        pool = OcrEnginePool(pool_size=2, engine_factory=factory)
        await pool.initialize()
        blocks = await pool.acquire_and_run(b"\x89PNG\x00")
        assert blocks[0].text == "e1"
        assert counter["n"] == 2

    asyncio.run(_run())


def test_pool_exclusive_per_instance():
    """同一实例不会被并发 acquire。"""
    engines = [_FakeEngine(i) for i in range(1, 3)]
    idx = {"i": 0}

    def factory():
        engine = engines[idx["i"]]
        idx["i"] += 1
        return engine

    async def _run():
        pool = OcrEnginePool(pool_size=2, engine_factory=factory)
        await pool.initialize()
        png = (
            b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01"
            b"\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x01\x01\x01\x00\x18\xdd\x8d\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
        )
        await asyncio.gather(pool.acquire_and_run(png), pool.acquire_and_run(png))
        assert max(e.max_concurrent for e in engines) == 1

    asyncio.run(_run())


def test_run_step3_ocr_async_parallel_pages(tmp_path):
    png_path = tmp_path / "page2.png"
    png_path.write_bytes(
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01"
        b"\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x01\x01\x01\x00\x18\xdd\x8d\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
    )
    png_path2 = tmp_path / "page3.png"
    png_path2.write_bytes(png_path.read_bytes())

    counter = {"n": 0}

    def factory():
        counter["n"] += 1
        return _FakeEngine(counter["n"])

    async def _run():
        pool = OcrEnginePool(pool_size=2, engine_factory=factory)
        await pool.initialize()
        data = Step3OcrInput(
            task_id="EXTTESTOCR2",
            pages=[
                Step3PageSourceInput(page=1, source="text_layer", text="Patient: Chan"),
                Step3PageSourceInput(page=2, source="ocr_required", image_path=str(png_path)),
                Step3PageSourceInput(page=3, source="ocr_required", image_path=str(png_path2)),
            ],
        )
        output = await run_step3_ocr_async(
            data,
            pool=pool,
            download_image=lambda path: open(path, "rb").read(),
            page_concurrency=2,
        )
        assert output.page_count == 3
        assert output.ocr_page_count == 2
        assert output.total_blocks == 3

    asyncio.run(_run())
