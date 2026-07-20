from fastapi import FastAPI
from fastapi.testclient import TestClient

from src.core.exceptions import ValidationException, register_exception_handlers
from src.core.i18n import (
    get_locale,
    locale_from_request,
    reset_locale,
    set_locale,
    translate_message,
)
from src.modules.claims.schemas import ExtractProgressOut
from src.modules.pdf_extraction.schemas import ExtractedFieldValueOut


def _test_app() -> FastAPI:
    app = FastAPI()

    @app.middleware("http")
    async def locale_middleware(request, call_next):
        token = set_locale(
            locale_from_request(
                request.cookies.get("locale"),
                request.headers.get("accept-language"),
            )
        )
        try:
            return await call_next(request)
        finally:
            reset_locale(token)

    register_exception_handlers(app)

    @app.get("/exception")
    async def exception_route():
        raise ValidationException(
            "以下必填字段缺失: patient_name, visit_date",
            code="CLAIM_REQUIRED_FIELDS",
        )

    @app.get("/dynamic")
    async def dynamic_route():
        progress = ExtractProgressOut(
            stage="FAILED",
            percent=0,
            message="提取失败：visit_index=3 不存在",
            status="FAILED",
        )
        field = ExtractedFieldValueOut(
            value="not-a-date",
            status="low_confidence",
            confidence=0.2,
            validation_error="日期格式无效，无法解析为 YYYY-MM-DD",
        )
        return {
            "progress": progress.model_dump(mode="json"),
            "field": field.model_dump(mode="json"),
        }

    return app


def test_locale_resolution_cookie_precedes_accept_language() -> None:
    assert locale_from_request("zh-HK", "en-HK") == "zh-HK"
    assert locale_from_request("en-HK", "zh-HK") == "en-HK"
    assert locale_from_request(None, "fr;q=1, en-HK;q=0.8, zh-HK;q=0.4") == "en-HK"
    assert locale_from_request(None, None) == "zh-HK"


def test_translate_message_supports_key_params_and_dynamic_details() -> None:
    assert translate_message("auth.invalid_credentials", "zh-HK") == "帳號或密碼錯誤"
    assert translate_message("账号或密码错误", "en-HK") == "Incorrect account or password"
    assert (
        translate_message("仍有 12 个字段未处理（既未映射也未标记忽略），无法发布", "en-HK")
        == "12 fields are still unprocessed (neither mapped nor ignored); cannot publish"
    )
    assert translate_message("未知业务数据", "en-HK") == "未知业务数据"


def test_exception_response_uses_cookie_locale_and_preserves_code() -> None:
    client = TestClient(_test_app())

    zh_response = client.get("/exception", cookies={"locale": "zh-HK"})
    assert zh_response.status_code == 422
    assert zh_response.json() == {
        "error": {
            "code": "CLAIM_REQUIRED_FIELDS",
            "message": "以下必填欄位缺失：patient_name, visit_date",
        }
    }

    en_response = client.get("/exception", cookies={"locale": "en-HK"})
    assert en_response.status_code == 422
    assert en_response.json() == {
        "error": {
            "code": "CLAIM_REQUIRED_FIELDS",
            "message": "The following required fields are missing: patient_name, visit_date",
        }
    }
    assert get_locale() == "zh-HK"


def test_progress_and_validation_messages_are_localized_at_response_exit() -> None:
    client = TestClient(_test_app())

    en_payload = client.get("/dynamic", cookies={"locale": "en-HK"}).json()
    assert en_payload["progress"]["message"] == "Extraction failed: visit_index=3 does not exist"
    assert (
        en_payload["field"]["validation_error"] == "Invalid date format; cannot parse as YYYY-MM-DD"
    )

    zh_payload = client.get("/dynamic", cookies={"locale": "zh-HK"}).json()
    assert zh_payload["progress"]["message"] == "提取失敗：visit_index=3 不存在"
    assert zh_payload["field"]["validation_error"] == "日期格式無效，無法解析為 YYYY-MM-DD"
