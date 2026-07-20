"""Vertex AI Gemini 封装（服务账号鉴权）。

未配置 GCP_PROJECT_ID 时进入 stub 模式：返回空结果，保证本地无凭证也能启动/联调。
不同 Step 可通过 location 参数使用不同 Vertex 区域（如 europe-west2 / global）。
"""
import asyncio
from typing import Any

from src.config import settings
from src.core.exceptions import AiServiceUnavailableError
from src.core.ai_usage_interceptor import track_ai_usage
from src.core.logging import get_logger
from src.modules.ai_extraction.gemini_usage import log_gemini_token_usage

logger = get_logger(__name__)

_TIMEOUT_S = 10.0
# PDF 提取：分类 / 就诊检测 / 字段提取等长文本 Gemini 调用
_LONG_TIMEOUT_S = 600.0
_MAX_RETRIES = 2
_VALID_THINKING_LEVELS = frozenset({"LOW", "MEDIUM", "HIGH", "MINIMAL"})


def resolve_thinking_level(level: str | None) -> Any | None:
    """将配置字符串映射为 google.genai ThinkingLevel；无效值回退 LOW。"""
    if not level:
        return None
    from google.genai import types

    normalized = level.strip().upper()
    if normalized not in _VALID_THINKING_LEVELS:
        logger.warning(
            "gemini_invalid_thinking_level",
            level=level,
            fallback="LOW",
        )
        normalized = "LOW"
    return getattr(types.ThinkingLevel, normalized)


class GeminiClient:
    def __init__(self, *, location: str | None = None) -> None:
        self._location = location or settings.GCP_LOCATION
        self._enabled = bool(settings.GCP_PROJECT_ID)
        self._client: Any = None
        if self._enabled:
            try:
                from google import genai

                self._client = genai.Client(
                    vertexai=True,
                    project=settings.GCP_PROJECT_ID,
                    location=self._location,
                )
            except Exception as exc:  # pragma: no cover
                logger.error(
                    "gemini_init_failed",
                    location=self._location,
                    error=str(exc),
                )
                self._enabled = False

    @property
    def location(self) -> str:
        return self._location

    @property
    def enabled(self) -> bool:
        return self._enabled

    async def extract_structured(
        self, prompt: str, response_schema: dict, *, usage_context: str = "ai_extract"
    ) -> dict[str, Any]:
        """病历文本结构化提取，response_schema 强约束 JSON 输出。"""
        return await self.generate_structured_json(
            prompt=prompt,
            response_schema=response_schema,
            model=settings.GEMINI_TEXT_MODEL,
            usage_context=usage_context,
        )

    @track_ai_usage
    async def generate_structured_json(
        self,
        prompt: str,
        response_schema: dict,
        *,
        model: str | None = None,
        temperature: float = 0.1,
        timeout_s: float | None = None,
        thinking_level: str | None = None,
        usage_context: str | None = None,
    ) -> dict[str, Any]:
        """通用结构化 JSON 生成（供分类、提取等 ai_service 调用）。"""
        if not self._enabled:
            logger.warning(
                "gemini_stub_structured",
                model=model or settings.GEMINI_TEXT_MODEL,
                location=self._location,
            )
            return {"parsed": {}, "token_usage": 0, "token_usage_detail": {}}

        from google.genai import types

        use_model = model or settings.GEMINI_TEXT_MODEL
        timeout = timeout_s or _TIMEOUT_S
        last_exc: Exception | None = None
        config_kwargs: dict[str, Any] = {
            "response_mime_type": "application/json",
            "response_schema": response_schema,
            "temperature": temperature,
        }
        resolved_thinking = resolve_thinking_level(thinking_level)
        if resolved_thinking is not None:
            config_kwargs["thinking_config"] = types.ThinkingConfig(
                thinking_level=resolved_thinking,
            )
        for attempt in range(_MAX_RETRIES + 1):
            try:
                response = await asyncio.wait_for(
                    self._client.aio.models.generate_content(
                        model=use_model,
                        contents=prompt,
                        config=types.GenerateContentConfig(**config_kwargs),
                    ),
                    timeout=timeout,
                )
                usage = log_gemini_token_usage(
                    usage_metadata=response.usage_metadata,
                    model=use_model,
                    location=self._location,
                    context=usage_context or "generate_structured_json",
                    thinking_level=thinking_level,
                )
                return {
                    "parsed": response.parsed,
                    "token_usage": usage["total_token_count"],
                    "token_usage_detail": usage,
                }
            except TimeoutError as exc:
                last_exc = exc
                await asyncio.sleep(2**attempt * 0.5)
            except Exception as exc:  # pragma: no cover
                last_exc = exc
                await asyncio.sleep(2**attempt * 0.5)
        logger.error(
            "gemini_structured_failed",
            model=use_model,
            location=self._location,
            error=str(last_exc) or repr(last_exc),
            error_type=type(last_exc).__name__ if last_exc else None,
        )
        message = "AI 识别暂时不可用，请手动填写"
        err_text = str(last_exc) or repr(last_exc)
        if isinstance(last_exc, TimeoutError):
            message = f"AI 请求超时（>{int(timeout)}s），请稍后重试"
        if "429" in err_text or "RESOURCE_EXHAUSTED" in err_text:
            message = "AI 服务配额已用尽或限流（429），请稍后重试或联系管理员"
        raise AiServiceUnavailableError(message) from last_exc

    @track_ai_usage
    async def analyze_pdf_page_image(
        self, image_bytes: bytes, hint_prompt: str, *, usage_context: str = "vision"
    ) -> dict[str, Any]:
        """PDF 页面视觉字段识别，用于模板标注 AI 辅助。"""
        if not self._enabled:
            logger.warning("gemini_stub_vision", location=self._location)
            return {}

        from google.genai import types

        try:
            response = await asyncio.wait_for(
                self._client.aio.models.generate_content(
                    model=settings.GEMINI_VISION_MODEL,
                    contents=[
                        types.Part.from_bytes(data=image_bytes, mime_type="image/png"),
                        hint_prompt,
                    ],
                    config=types.GenerateContentConfig(
                        response_mime_type="application/json",
                        temperature=0.1,
                    ),
                ),
                timeout=_TIMEOUT_S * 2,
            )
            log_gemini_token_usage(
                usage_metadata=response.usage_metadata,
                model=settings.GEMINI_VISION_MODEL,
                location=self._location,
                context=usage_context,
            )
            return response.parsed or {}
        except Exception as exc:
            logger.error("gemini_vision_failed", location=self._location, error=str(exc))
            return {}


_clients: dict[str, GeminiClient] = {}


def get_gemini_client(location: str | None = None) -> GeminiClient:
    """按 Vertex 区域获取（并缓存）Gemini 客户端。location 默认 GCP_LOCATION。"""
    loc = location or settings.GCP_LOCATION
    if loc not in _clients:
        _clients[loc] = GeminiClient(location=loc)
    return _clients[loc]


def reset_gemini_clients() -> None:
    """测试用：清空客户端缓存。"""
    _clients.clear()
