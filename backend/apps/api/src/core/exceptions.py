"""领域异常与 FastAPI 异常处理器。"""
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from src.core.i18n import translate_message


class AppException(Exception):
    status_code = 400
    code = "APP_ERROR"

    def __init__(
        self,
        message: str,
        *,
        code: str | None = None,
        params: dict[str, object] | None = None,
    ):
        self.message = message
        self.params = params
        if code:
            self.code = code
        super().__init__(message)


class NotFoundException(AppException):
    status_code = 404
    code = "NOT_FOUND"


class ValidationException(AppException):
    status_code = 422
    code = "VALIDATION_ERROR"


class ConflictException(AppException):
    """乐观锁 / 唯一约束冲突，HTTP 409。"""

    status_code = 409
    code = "CONFLICT"


class AuthException(AppException):
    status_code = 401
    code = "UNAUTHORIZED"


class ForbiddenException(AppException):
    status_code = 403
    code = "FORBIDDEN"


class AiServiceUnavailableError(AppException):
    status_code = 503
    code = "AI_UNAVAILABLE"


class StorageUnavailableError(AppException):
    status_code = 503
    code = "STORAGE_UNAVAILABLE"


class RateLimitException(AppException):
    status_code = 429
    code = "RATE_LIMITED"


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppException)
    async def _handle_app_exception(_: Request, exc: AppException) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error": {
                    "code": exc.code,
                    "message": translate_message(exc.message, params=exc.params),
                }
            },
        )
