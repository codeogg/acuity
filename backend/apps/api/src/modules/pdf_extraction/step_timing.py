"""病历 PDF 提取流水线各 Step 耗时记录与汇总日志。"""
from __future__ import annotations

import time
from contextvars import ContextVar
from functools import wraps
from typing import Any, Callable, TypeVar

from src.core.logging import get_logger

logger = get_logger(__name__)

F = TypeVar("F", bound=Callable[..., Any])

_timings: ContextVar[list[dict[str, Any]] | None] = ContextVar("_timings", default=None)

STEP_LABELS: dict[str, str] = {
    "step2_preprocess": "Step2 预处理",
    "step3_ocr": "Step3 OCR/文档解析",
    "step4_classify": "Step4 文档分类",
    "step5_detect_visits": "Step5 就诊检测",
    "step5_select_visit": "Step5 选择就诊",
    "step6_build_prompt": "Step6 Prompt 构建",
    "step7_extract_fields": "Step7 字段提取",
    "step8_validate": "Step8 字段校验",
    "step9_detect_missing": "Step9 缺失检测",
    "step10_map_insurance": "Step10 保司映射",
    "step11_prepare_review": "Step11 生成核对数据",
}


def begin_pipeline_timing() -> None:
    """开始一次 pipeline 执行的耗时收集（arq worker 入口调用）。"""
    _timings.set([])


def record_step(step: str, task_no: str, elapsed_ms: int) -> None:
    """记录单步耗时并写入结构化日志。"""
    label = STEP_LABELS.get(step, step)
    logger.info(
        "extraction_step_timing",
        step=step,
        step_label=label,
        task_no=task_no,
        elapsed_ms=elapsed_ms,
        elapsed_s=round(elapsed_ms / 1000, 3),
    )
    bucket = _timings.get()
    if bucket is not None:
        bucket.append(
            {
                "step": step,
                "step_label": label,
                "task_no": task_no,
                "elapsed_ms": elapsed_ms,
            }
        )


def log_pipeline_timing_summary(*, submission_id: int, task_no: str) -> None:
    """汇总本次 pipeline 各 Step 耗时，标出最慢步骤。"""
    bucket = _timings.get() or []
    if not bucket:
        _timings.set(None)
        return

    total_ms = sum(item["elapsed_ms"] for item in bucket)
    ranked = sorted(bucket, key=lambda item: item["elapsed_ms"], reverse=True)
    slowest = ranked[0]
    logger.info(
        "extraction_pipeline_timing_summary",
        submission_id=submission_id,
        task_no=task_no,
        total_elapsed_ms=total_ms,
        total_elapsed_s=round(total_ms / 1000, 3),
        step_count=len(bucket),
        slowest_step=slowest["step"],
        slowest_step_label=slowest["step_label"],
        slowest_elapsed_ms=slowest["elapsed_ms"],
        slowest_elapsed_s=round(slowest["elapsed_ms"] / 1000, 3),
        steps=ranked,
    )
    _timings.set(None)


def timed_extraction_step(step: str) -> Callable[[F], F]:
    """装饰 service 层 run_* 函数，自动记录该 Step 耗时。"""

    def decorator(fn: F) -> F:
        @wraps(fn)
        async def wrapper(*args: Any, **kwargs: Any) -> Any:
            task_no = str(kwargs.get("task_no", "?"))
            start = time.perf_counter()
            try:
                return await fn(*args, **kwargs)
            finally:
                elapsed_ms = int((time.perf_counter() - start) * 1000)
                record_step(step, task_no, elapsed_ms)

        return wrapper  # type: ignore[return-value]

    return decorator
