"""arq worker 入口。启动：arq src.tasks.worker.WorkerSettings"""
from typing import Any

from arq.connections import RedisSettings

from src.config import settings
from src.core.logging import configure_logging, get_logger
from src.modules.pdf_extraction.document_parser import uses_mineru
from src.modules.pdf_extraction.ocr_service.warmup import warmup_ocr_pool
from src.tasks.ai_assist_task import ai_assist_recognize_task
from src.tasks.extraction_pipeline_task import run_extraction_pipeline
from src.tasks.parse_template_task import parse_template_task

configure_logging()
logger = get_logger(__name__)


async def worker_startup(ctx: dict[str, Any]) -> None:
    """Worker 启动时预热 OCR 池（MinerU 模式跳过）。"""
    if not settings.OCR_PRELOAD or uses_mineru():
        return
    logger.info("worker_ocr_pool_warmup_start")
    await warmup_ocr_pool()


class WorkerSettings:
    functions = [parse_template_task, ai_assist_recognize_task, run_extraction_pipeline]
    redis_settings = RedisSettings.from_dsn(settings.REDIS_URL)
    max_jobs = 10
    job_timeout = max(1200, settings.MINERU_TIMEOUT_S + 600)
    on_startup = worker_startup
