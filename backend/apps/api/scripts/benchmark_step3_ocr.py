#!/usr/bin/env python3
"""对 sample PDF 连续执行 Step3 OCR，统计耗时波动（验证冷启动 vs 热池）。

用法（在 apps/api 目录）：
    source .venv/bin/activate
    python scripts/benchmark_step3_ocr.py

可选参数：
    --pdf ../../sample/08_medilink_zh_discharge.pdf
    --runs 10
    --warmup-pool   # 先预热 OCR 池再计时（排除模型加载）
"""
from __future__ import annotations

import argparse
import asyncio
import os
import statistics
import sys
import time
from collections.abc import Callable
from pathlib import Path

import fitz

API_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = API_ROOT.parent.parent
sys.path.insert(0, str(API_ROOT))

os.environ.setdefault("PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK", "True")

from src.config import settings  # noqa: E402
from src.modules.pdf_extraction.ocr_service.engine_pool import (  # noqa: E402
    get_ocr_pool,
    reset_ocr_pool,
)
from src.modules.pdf_extraction.ocr_service.warmup import warmup_ocr_pool  # noqa: E402
from src.modules.pdf_extraction.schemas import (  # noqa: E402
    Step3OcrInput,
    Step3PageSourceInput,
)
from src.modules.pdf_extraction.steps.step2_preprocess import (  # noqa: E402
    RENDER_DPI,
    _render_page_png as render_page_png,
    has_substantial_text,
)
from src.modules.pdf_extraction.steps.step3_ocr import run_step3_ocr_async  # noqa: E402

DEFAULT_PDF = REPO_ROOT / "sample" / "08_medilink_zh_discharge.pdf"
TASK_ID = "BENCH_STEP3_OCR"


def _preprocess_in_memory(pdf_bytes: bytes) -> tuple[Step3OcrInput, dict[str, bytes]]:
    """预处理 PDF，扫描页 PNG 放内存，避免 MinIO 网络干扰计时。"""
    image_store: dict[str, bytes] = {}
    pages: list[Step3PageSourceInput] = []

    with fitz.open(stream=pdf_bytes, filetype="pdf") as doc:
        if doc.page_count == 0:
            raise ValueError("PDF 无页面")

        for index in range(doc.page_count):
            page_no = index + 1
            page = doc.load_page(index)
            text = page.get_text("text")

            if has_substantial_text(text):
                pages.append(
                    Step3PageSourceInput(
                        page=page_no,
                        source="text_layer",
                        text=text.strip(),
                        image_path=None,
                    )
                )
                continue

            image_key = f"memory://page-{page_no}.png"
            image_store[image_key] = render_page_png(page)
            pages.append(
                Step3PageSourceInput(
                    page=page_no,
                    source="ocr_required",
                    text=None,
                    image_path=image_key,
                )
            )

    return Step3OcrInput(task_id=TASK_ID, pages=pages), image_store


def _download_from_memory(store: dict[str, bytes]) -> Callable[[str], bytes]:
    def download(path: str) -> bytes:
        data = store.get(path)
        if data is None:
            raise FileNotFoundError(f"内存中无图片：{path}")
        return data

    return download


async def _run_once(
    step_input: Step3OcrInput, download_image: Callable[[str], bytes]
) -> tuple[int, int]:
    """执行一次 Step3 OCR，返回 (耗时 ms, total_blocks)。"""
    pool = get_ocr_pool()
    start = time.perf_counter()
    output = await run_step3_ocr_async(
        step_input,
        pool=pool,
        download_image=download_image,
    )
    elapsed_ms = int((time.perf_counter() - start) * 1000)
    return elapsed_ms, output.total_blocks


def _print_page_summary(step_input: Step3OcrInput) -> None:
    ocr_pages = sum(1 for p in step_input.pages if p.source == "ocr_required")
    text_pages = sum(1 for p in step_input.pages if p.source == "text_layer")
    print(f"PDF 页数: {len(step_input.pages)}（OCR 扫描页 {ocr_pages}，文本层 {text_pages}）")
    print(
        f"OCR 配置: pool_size={settings.OCR_POOL_SIZE}, "
        f"page_concurrency={settings.OCR_PAGE_CONCURRENCY}, "
        f"det={settings.OCR_DET_MODEL_NAME}, rec={settings.OCR_REC_MODEL_NAME}, "
        f"DPI={RENDER_DPI}, DOCUMENT_PARSER={settings.DOCUMENT_PARSER}"
    )


async def main() -> None:
    parser = argparse.ArgumentParser(description="Step3 OCR 耗时基准测试")
    parser.add_argument("--pdf", type=Path, default=DEFAULT_PDF, help="待测 PDF 路径")
    parser.add_argument("--runs", type=int, default=10, help="OCR 重复次数")
    parser.add_argument(
        "--warmup-pool",
        action="store_true",
        help="计时前先预热 OCR 引擎池（排除模型加载耗时）",
    )
    args = parser.parse_args()

    pdf_path: Path = args.pdf.resolve()
    if not pdf_path.exists():
        print(f"ERROR: PDF 不存在: {pdf_path}")
        sys.exit(1)

    pdf_bytes = pdf_path.read_bytes()
    print(f"测试文件: {pdf_path.name} ({len(pdf_bytes) / 1024:.1f} KB)")
    print(f"重复次数: {args.runs}")
    print()

    preprocess_start = time.perf_counter()
    step_input, image_store = _preprocess_in_memory(pdf_bytes)
    preprocess_ms = int((time.perf_counter() - preprocess_start) * 1000)
    download_image = _download_from_memory(image_store)

    _print_page_summary(step_input)
    print(f"Step2 预处理（不计入 OCR 耗时）: {preprocess_ms} ms")
    print()

    reset_ocr_pool()

    if args.warmup_pool:
        print("预热 OCR 引擎池（含推理热身）…")
        warmup_start = time.perf_counter()
        await warmup_ocr_pool()
        warmup_ms = int((time.perf_counter() - warmup_start) * 1000)
        print(f"预热完成: {warmup_ms} ms（不计入下方 OCR 轮次）")
        print()

    timings: list[int] = []
    blocks_per_run: list[int] = []

    print(f"{'轮次':>4}  {'耗时(ms)':>10}  {'耗时(s)':>8}  {'blocks':>8}")
    print("-" * 40)

    for i in range(1, args.runs + 1):
        elapsed_ms, total_blocks = await _run_once(step_input, download_image)
        timings.append(elapsed_ms)
        blocks_per_run.append(total_blocks)
        print(f"{i:>4}  {elapsed_ms:>10}  {elapsed_ms / 1000:>8.3f}  {total_blocks:>8}")

    print("-" * 40)
    first_ms = timings[0]
    rest = timings[1:] if len(timings) > 1 else []
    rest_avg = statistics.mean(rest) if rest else float(first_ms)
    rest_min = min(rest) if rest else first_ms
    rest_max = max(rest) if rest else first_ms

    print()
    print("统计:")
    print(f"  第 1 次:     {first_ms} ms ({first_ms / 1000:.3f} s)")
    if rest:
        print(f"  第 2~{args.runs} 次平均: {rest_avg:.0f} ms ({rest_avg / 1000:.3f} s)")
        print(f"  第 2~{args.runs} 次范围: {rest_min} ~ {rest_max} ms")
        print(f"  全部平均:    {statistics.mean(timings):.0f} ms")
        print(f"  全部中位数:  {statistics.median(timings):.0f} ms")
        if rest_avg > 0:
            ratio = first_ms / rest_avg
            print(f"  第1次 / 后续平均: {ratio:.2f}x")
            if ratio > 1.2:
                print("  → 第 1 次明显更慢，符合「冷启动 / 模型加载」预期")
            elif ratio < 1.1:
                print("  → 各轮耗时接近，冷启动影响不明显或已被预热吸收")
    print(f"  blocks 一致性: {len(set(blocks_per_run)) == 1}（各轮均为 {blocks_per_run[0]}）")


if __name__ == "__main__":
    asyncio.run(main())
