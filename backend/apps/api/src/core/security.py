"""JWT 签发/校验 + 密码哈希。"""
from datetime import UTC, datetime, timedelta
from typing import Any

from jose import JWTError, jwt
from passlib.context import CryptContext

from src.config import settings
from src.core.exceptions import AuthException

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(
    *, user_id: int, role: str, clinic_id: int | None = None
) -> str:
    """role: SUPER_ADMIN/OPERATOR/ANNOTATOR/DOCTOR。DOCTOR 必须携带 clinic_id。"""
    payload: dict[str, Any] = {
        "sub": str(user_id),
        "role": role,
        "clinic_id": clinic_id,
        "exp": datetime.now(UTC) + timedelta(hours=settings.JWT_EXPIRE_HOURS),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> dict[str, Any]:
    try:
        return jwt.decode(
            token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM]
        )
    except JWTError as exc:
        raise AuthException("登录已失效，请重新登录") from exc
