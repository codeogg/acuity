"""对象存储封装（S3 协议兼容 / MinIO），带本地文件降级兜底。

默认写入 MinIO；MinIO 不可用时自动降级到 LOCAL_STORAGE_DIR 本地目录。
返回的 /local-storage/{key} 为 API 代理路径，实际文件存于 MinIO（私有桶经代理访问）。
"""
from pathlib import Path

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError

from src.config import settings
from src.core.exceptions import StorageUnavailableError
from src.core.logging import get_logger

logger = get_logger(__name__)

_STORAGE_UNAVAILABLE_MSG = "对象存储不可用，请确认 MinIO 服务已启动"


def _s3_client():
    return boto3.client(
        "s3",
        endpoint_url=settings.S3_ENDPOINT or None,
        aws_access_key_id=settings.S3_ACCESS_KEY or None,
        aws_secret_access_key=settings.S3_SECRET_KEY or None,
        region_name=settings.S3_REGION,
        config=Config(signature_version="s3v4"),
    )


# ── 本地文件降级 ──────────────────────────────────────────────


def _local_storage_dir() -> Path:
    return Path(settings.LOCAL_STORAGE_DIR).resolve()


def _ensure_local_dir(key: str) -> Path:
    """确保 key 的父目录存在，返回完整本地路径。"""
    local = _local_storage_dir() / key
    local.parent.mkdir(parents=True, exist_ok=True)
    return local


def _local_upload(data: bytes, key: str) -> None:
    """写入本地文件。"""
    local = _ensure_local_dir(key)
    local.write_bytes(data)
    logger.info("local_upload_ok", key=key, path=str(local))


def _local_download(key: str) -> bytes:
    """从本地文件读取。不存在时抛 FileNotFoundError。"""
    local = _local_storage_dir() / key
    if not local.exists():
        raise FileNotFoundError(key)
    return local.read_bytes()


# ── 公开 API ──────────────────────────────────────────────────


def upload_bytes(data: bytes, key: str, content_type: str = "application/pdf") -> str:
    """上传字节流，优先 MinIO，不可用时降级到本地文件。

    返回同源代理路径 /local-storage/{key}。
    """
    try:
        client = _s3_client()
        # A fresh local MinIO instance does not create application buckets by
        # itself.  Ensure it exists before the first upload so brand assets are
        # persisted in the named volume instead of falling back to the API
        # container's ephemeral filesystem.
        try:
            client.head_bucket(Bucket=settings.S3_BUCKET)
        except ClientError:
            client.create_bucket(Bucket=settings.S3_BUCKET)
        client.put_object(
            Bucket=settings.S3_BUCKET, Key=key, Body=data, ContentType=content_type
        )
        logger.debug("s3_upload_ok", key=key)
        return f"/local-storage/{key}"
    except (BotoCoreError, ClientError, ValueError) as exc:
        logger.warning("s3_upload_failed, fallback to local", key=key, error=str(exc))
        _local_upload(data, key)
        return f"/local-storage/{key}"


def download_bytes(key_or_url: str) -> bytes:
    """按 key 或此前返回的 URL 读取对象，优先 MinIO，不可用时降级到本地文件。"""
    key = _url_to_key(key_or_url)
    try:
        client = _s3_client()
        obj = client.get_object(Bucket=settings.S3_BUCKET, Key=key)
        return obj["Body"].read()
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code", "")
        if code in ("NoSuchKey", "404", "NotFound"):
            # MinIO 中不存在，尝试本地降级
            logger.info("s3_key_not_found, try local fallback", key=key)
            return _local_download(key)
        logger.warning("s3_download_failed, fallback to local", key=key, error=str(exc))
        return _local_download(key)
    except (BotoCoreError, ValueError) as exc:
        logger.warning("s3_download_failed, fallback to local", key=key, error=str(exc))
        return _local_download(key)


def delete_bytes(key_or_url: str) -> None:
    """按 key 或 URL 删除对象（MinIO + 本地降级均清理）。"""
    key = _url_to_key(key_or_url)
    # 尝试删除 MinIO 对象
    try:
        client = _s3_client()
        client.delete_object(Bucket=settings.S3_BUCKET, Key=key)
    except Exception as exc:
        logger.warning("s3_delete_failed, ignored", key=key, error=str(exc))
    # 清理本地降级文件
    local = _local_storage_dir() / key
    if local.exists():
        local.unlink()
        logger.info("local_delete_ok", key=key, path=str(local))


def _url_to_key(key_or_url: str) -> str:
    for prefix in (settings.S3_PUBLIC_BASE_URL.rstrip("/") + "/", "/local-storage/"):
        if key_or_url.startswith(prefix):
            return key_or_url[len(prefix):]
    return key_or_url.lstrip("/")
