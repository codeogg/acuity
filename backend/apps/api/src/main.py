"""FastAPI 应用入口。"""
import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.config import settings
from src.core.exceptions import register_exception_handlers
from src.core.i18n import locale_from_request, reset_locale, set_locale
from src.core.logging import configure_logging, get_logger
from src.modules.ai_extraction.router import router as ai_router
from src.modules.analytics.router import router as analytics_router
from src.modules.audit.router import router as audit_router
from src.modules.auth.router import router as auth_router
from src.modules.claims.router import admin_router as claims_admin_router
from src.modules.claims.router import router as claims_router
from src.modules.clinics.router import router as clinics_router
from src.modules.districts.router import router as districts_router
from src.modules.doctor_settings.router import router as doctor_settings_router
from src.modules.doctors.router import router as doctors_router
from src.modules.mfa.router import router as mfa_router
from src.modules.insurance_companies.router import router as insurance_router
from src.modules.pdf_extraction.document_parser import uses_mineru
from src.modules.pdf_extraction.ocr_service.warmup import warmup_ocr_pool
from src.modules.pdf_extraction.router import router as pdf_extraction_router
from src.modules.standard_fields.router import router as standard_fields_router
from src.modules.stats.router import router as stats_router
from src.modules.storage.router import router as storage_router
from src.modules.tags.router import router as tags_router
from src.modules.templates.router import router as templates_router
from src.modules.tickets.router import router as tickets_router

logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    logger.info("api_starting", env=settings.APP_ENV)
    if settings.OCR_PRELOAD and not uses_mineru():
        asyncio.create_task(warmup_ocr_pool())
    yield
    logger.info("api_stopping")


app = FastAPI(
    title="香港诊所保险保单智能填报 API",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def request_locale_middleware(request, call_next):
    """为本次请求设置 locale，并在结束时精确恢复 ContextVar。"""
    locale = locale_from_request(
        request.cookies.get("locale"),
        request.headers.get("accept-language"),
    )
    token = set_locale(locale)
    try:
        return await call_next(request)
    finally:
        reset_locale(token)


register_exception_handlers(app)

for router in (
    auth_router,
    audit_router,
    clinics_router,
    districts_router,
    doctors_router,
    mfa_router,
    doctor_settings_router,
    insurance_router,
    standard_fields_router,
    templates_router,
    ai_router,
    analytics_router,
    claims_router,
    claims_admin_router,
    pdf_extraction_router,
    stats_router,
    storage_router,
    tags_router,
    tickets_router,
):
    app.include_router(router)


@app.get("/health", tags=["system"])
async def health() -> dict:
    return {"status": "ok"}
