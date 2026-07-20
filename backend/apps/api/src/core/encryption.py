"""病历文本字段级加密（Fernet）。密钥生产环境应走 KMS/Secrets Manager。"""
from cryptography.fernet import Fernet

from src.config import settings
from src.core.logging import get_logger

logger = get_logger(__name__)

if settings.FIELD_ENCRYPTION_KEY:
    _key = settings.FIELD_ENCRYPTION_KEY.encode()
else:
    _key = Fernet.generate_key()
    logger.warning(
        "field_encryption_key_missing",
        detail="未配置 FIELD_ENCRYPTION_KEY，已生成临时密钥；重启后旧密文将无法解密（仅限开发）",
    )

_fernet = Fernet(_key)


def encrypt_text(plain: str | None) -> str | None:
    if plain is None:
        return None
    return _fernet.encrypt(plain.encode()).decode()


def decrypt_text(cipher: str | None) -> str | None:
    if cipher is None:
        return None
    try:
        return _fernet.decrypt(cipher.encode()).decode()
    except Exception:
        logger.error("decrypt_failed")
        return None
