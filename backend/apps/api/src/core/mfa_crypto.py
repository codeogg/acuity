"""AES (Fernet) encryption for MFA TOTP secrets."""
from cryptography.fernet import Fernet

from src.config import settings
from src.core.exceptions import AppException
from src.core.logging import get_logger

logger = get_logger(__name__)

_fernet: Fernet | None = None


def _get_fernet() -> Fernet:
    global _fernet
    if _fernet is not None:
        return _fernet
    key = settings.MFA_ENCRYPTION_KEY.strip()
    if not key:
        if settings.APP_ENV == "local":
            key = Fernet.generate_key().decode()
            logger.warning(
                "mfa_encryption_key_missing",
                detail="未配置 MFA_ENCRYPTION_KEY，已生成临时密钥（仅限开发）",
            )
        else:
            raise AppException("MFA 加密密钥未配置")
    _fernet = Fernet(key.encode() if isinstance(key, str) else key)
    return _fernet


def encrypt_mfa_secret(plain: str) -> str:
    return _get_fernet().encrypt(plain.encode()).decode()


def decrypt_mfa_secret(cipher: str) -> str:
    try:
        return _get_fernet().decrypt(cipher.encode()).decode()
    except Exception as exc:
        logger.error("mfa_secret_decrypt_failed")
        raise AppException("MFA 密钥解密失败") from exc
