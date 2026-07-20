"""任务入队助手。Redis 不可用时降级为同步执行（本地无 worker 也能跑通流程）。"""
from arq import create_pool
from arq.connections import RedisSettings

from src.config import settings
from src.core.logging import get_logger

logger = get_logger(__name__)

# 与 WorkerSettings.job_timeout 保持一致（秒）
PARSE_JOB_TIMEOUT = 180


async def _enqueue(function_name: str, *args) -> str | None:
    try:
        pool = await create_pool(RedisSettings.from_dsn(settings.REDIS_URL))
        # job_timeout 由 WorkerSettings.job_timeout 统一配置；勿传 _job_timeout，
        # arq 0.28 会将其当作任务函数 kwargs 导致 TypeError
        job = await pool.enqueue_job(function_name, *args)
        await pool.close()
        return job.job_id if job else None
    except Exception as exc:
        logger.warning("enqueue_failed_run_inline", function=function_name, error=str(exc))
        return None


async def enqueue_parse_template(template_id: int) -> str | None:
    """入队模板解析任务，返回 arq job_id；Redis 不可用时内联执行。"""
    job_id = await _enqueue("parse_template_task", template_id)
    if job_id is None:
        from src.tasks.parse_template_task import parse_template_task

        await parse_template_task(None, template_id)
    return job_id


async def enqueue_ai_assist(template_id: int) -> str | None:
    job_id = await _enqueue("ai_assist_recognize_task", template_id)
    if job_id is None:
        from src.tasks.ai_assist_task import ai_assist_recognize_task

        await ai_assist_recognize_task(None, template_id)
    return job_id


async def enqueue_extraction_pipeline(
    submission_id: int,
    *,
    resume_from_stage: str | None = None,
    visit_index: int | None = None,
) -> str | None:
    job_id = await _enqueue(
        "run_extraction_pipeline", submission_id, resume_from_stage, visit_index
    )
    if job_id is None:
        from src.tasks.extraction_pipeline_task import run_extraction_pipeline

        await run_extraction_pipeline(
            None, submission_id, resume_from_stage, visit_index
        )
    return job_id


async def abort_arq_job(job_id: str | None) -> bool:
    """尽力中止 arq 任务；job 不存在或 Redis 不可用时返回 False。"""
    if not job_id:
        return False
    try:
        from arq.jobs import Job

        pool = await create_pool(RedisSettings.from_dsn(settings.REDIS_URL))
        try:
            job = Job(job_id, pool)
            # 短超时：取消接口不应长时间阻塞等待 worker 退出
            return bool(await job.abort(timeout=1.0))
        finally:
            await pool.close()
    except Exception as exc:
        logger.warning("abort_arq_job_failed", job_id=job_id, error=str(exc))
        return False
