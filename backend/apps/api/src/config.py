"""应用配置（pydantic-settings，从环境变量 / .env 读取）。"""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    APP_ENV: str = "local"
    CORS_ORIGINS: str = "http://localhost:3000"

    # 数据库 / Redis
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/insurance"
    REDIS_URL: str = "redis://localhost:6379/0"

    # 鉴权
    JWT_SECRET: str = "change-me"
    JWT_EXPIRE_HOURS: int = 8
    JWT_ALGORITHM: str = "HS256"

    # 病历字段级加密（Fernet key）。留空则运行时自动生成（仅开发用，重启后旧数据无法解密）
    FIELD_ENCRYPTION_KEY: str = ""
    # MFA TOTP 密钥 AES 加密（Fernet key，独立于病历加密）
    MFA_ENCRYPTION_KEY: str = ""

    # 对象存储（S3 协议）
    S3_BUCKET: str = "insurance"
    S3_ENDPOINT: str = "http://localhost:9000"
    S3_ACCESS_KEY: str = "minioadmin"
    S3_SECRET_KEY: str = "minioadmin"
    S3_REGION: str = "us-east-1"
    S3_PUBLIC_BASE_URL: str = "http://localhost:9000/insurance"
    # Minio 不可用时的本地文件降级存储路径
    LOCAL_STORAGE_DIR: str = "./data/storage"

    # Vertex AI Gemini
    GCP_PROJECT_ID: str = ""
    GCP_LOCATION: str = "europe-west2"
    GOOGLE_APPLICATION_CREDENTIALS: str = ""
    GEMINI_TEXT_MODEL: str = "gemini-2.5-flash"
    GEMINI_VISION_MODEL: str = "gemini-2.5-pro"
    # Step4 文档分类
    GEMINI_CLASSIFIER_MODEL: str = "gemini-2.5-flash"
    GEMINI_CLASSIFIER_LOCATION: str = ""
    # Step5 多就诊检测（默认同分类：Flash + europe-west2）
    GEMINI_VISIT_DETECTOR_MODEL: str = "gemini-2.5-flash"
    GEMINI_VISIT_DETECTOR_LOCATION: str = ""
    # Step7 字段提取
    GEMINI_EXTRACTOR_MODEL: str = "gemini-3.1-pro-preview"
    GEMINI_EXTRACTOR_LOCATION: str = "global"
    # Step7 thinking 级别（gemini-3.1-pro-preview）：low / medium / high
    GEMINI_EXTRACTOR_THINKING_LEVEL: str = "low"

    # AI 限流
    AI_RATE_LIMIT_PER_MINUTE: int = 20

    # 本地开发：Gemini 调用失败（如 429 配额）时自动降级 stub，保证流水线可继续联调
    GEMINI_STUB_ON_ERROR: bool = False

    # 启动时初始化 PaddleOCR 实例池（API lifespan + arq Worker on_startup）
    OCR_PRELOAD: bool = True
    OCR_POOL_SIZE: int = 3
    # 启动时立即创建的引擎数（其余按需懒加载）；设为 1 可显著缩短冷启动
    OCR_POOL_WARMUP_SIZE: int = 1
    # 预热时跑一次空推理，消除首次 predict 的 CPU 图编译开销
    OCR_WARMUP_INFERENCE: bool = True
    # 单任务内并行 OCR 页数上限（为其他并发任务留出池内实例）
    OCR_PAGE_CONCURRENCY: int = 2
    # PaddleOCR 模型（v6 无 mobile 命名，移动端对应 small；medium=默认高精度）
    OCR_DET_MODEL_NAME: str = "PP-OCRv6_medium_det"
    OCR_REC_MODEL_NAME: str = "PP-OCRv6_medium_rec"

    # 文档解析：paddle=逐页 PaddleOCR；mineru=整 PDF → Markdown（本地 MinerU）
    DOCUMENT_PARSER: str = "paddle"
    MINERU_CLI: str = "mineru"
    MINERU_API_URL: str = ""
    MINERU_BACKEND: str = "pipeline"
    MINERU_LANG: str = ""
    MINERU_TIMEOUT_S: int = 900

    @property
    def gemini_classifier_location(self) -> str:
        return self.GEMINI_CLASSIFIER_LOCATION or self.GCP_LOCATION

    @property
    def gemini_visit_detector_location(self) -> str:
        return self.GEMINI_VISIT_DETECTOR_LOCATION or self.gemini_classifier_location

    @property
    def gemini_extractor_location(self) -> str:
        return self.GEMINI_EXTRACTOR_LOCATION or "global"

    @property
    def gemini_stub_on_error(self) -> bool:
        if self.GEMINI_STUB_ON_ERROR:
            return True
        return self.APP_ENV == "local"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
