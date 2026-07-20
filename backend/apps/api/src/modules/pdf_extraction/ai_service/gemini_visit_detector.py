"""Gemini 2.5 Flash 多就诊检测实现。"""
from __future__ import annotations

from src.config import settings
from src.modules.ai_extraction.gemini_client import (
    GeminiClient,
    _LONG_TIMEOUT_S,
    get_gemini_client,
)
from src.modules.pdf_extraction.ai_service import DocumentClassificationResult
from src.modules.pdf_extraction.ai_service.fallback import call_or_stub
from src.modules.pdf_extraction.ai_service.prompts import (
    VISIT_DETECTION_RESPONSE_SCHEMA,
    build_visit_detection_prompt,
)
from src.modules.pdf_extraction.ai_service.visit_detector import (
    IVisitDetector,
    VisitCandidateResult,
    VisitDetectionInvokeResult,
)


def _stub_visits(total_pages: int) -> list[VisitCandidateResult]:
    mid = max(1, total_pages // 2)
    end1 = min(mid, total_pages)
    start2 = min(end1 + 1, total_pages)
    return [
        VisitCandidateResult(
            visit_index=1,
            visit_date="2025-01-10",
            summary="Visit 1 (stub)",
            page_range=[1, end1],
        ),
        VisitCandidateResult(
            visit_index=2,
            visit_date="2025-03-01",
            summary="Visit 2 (stub)",
            page_range=[start2, total_pages],
        ),
    ]


def normalize_visits(
    visits: list[VisitCandidateResult], *, total_pages: int
) -> list[VisitCandidateResult]:
    normalized: list[VisitCandidateResult] = []
    for visit in sorted(visits, key=lambda item: item.visit_index):
        start, end = visit.page_range
        start = max(1, min(start, total_pages))
        end = max(start, min(end, total_pages))
        normalized.append(
            visit.model_copy(update={"page_range": [start, end]})
        )
    return normalized


class GeminiVisitDetector(IVisitDetector):
    def __init__(self, client: GeminiClient | None = None) -> None:
        self._client = client or get_gemini_client(settings.gemini_visit_detector_location)

    async def detect_visits(
        self,
        document_text: str,
        classification: DocumentClassificationResult,
        *,
        total_pages: int,
    ) -> VisitDetectionInvokeResult:
        model_name = settings.GEMINI_VISIT_DETECTOR_MODEL
        if not self._client.enabled:
            return VisitDetectionInvokeResult(
                visits=_stub_visits(total_pages),
                model_name=f"{model_name}:stub",
                token_usage=0,
                stub=True,
            )

        async def _invoke() -> VisitDetectionInvokeResult:
            prompt = build_visit_detection_prompt(
                document_text,
                document_type=classification.document_type,
                language=classification.language,
                total_pages=total_pages,
            )
            raw = await self._client.generate_structured_json(
                prompt=prompt,
                response_schema=VISIT_DETECTION_RESPONSE_SCHEMA,
                model=model_name,
                temperature=0.0,
                timeout_s=_LONG_TIMEOUT_S,
                usage_context="step5_detect_visits",
            )
            parsed = raw.get("parsed") or {}
            visits_raw = parsed.get("visits") or []
            visits = normalize_visits(
                [VisitCandidateResult.model_validate(item) for item in visits_raw],
                total_pages=total_pages,
            )
            if not visits:
                raise ValueError("就诊检测未返回任何候选记录")

            return VisitDetectionInvokeResult(
                visits=visits,
                model_name=model_name,
                token_usage=int(raw.get("token_usage") or 0),
                stub=False,
            )

        def _stub() -> VisitDetectionInvokeResult:
            return VisitDetectionInvokeResult(
                visits=_stub_visits(total_pages),
                model_name=f"{model_name}:stub",
                token_usage=0,
                stub=True,
            )

        return await call_or_stub(
            "step5_detect_visits",
            model=model_name,
            call=_invoke,
            stub=_stub,
        )
