"""闲置锁屏时间（分钟）校验与默认值。"""
from src.core.exceptions import ValidationException

IDLE_LOCK_MIN = 2
IDLE_LOCK_MAX = 30
DEFAULT_IDLE_LOCK_MINUTES = 10


def validate_idle_lock_minutes(minutes: int) -> int:
    if not IDLE_LOCK_MIN <= minutes <= IDLE_LOCK_MAX:
        raise ValidationException(
            f"闲置锁屏时间须在 {IDLE_LOCK_MIN} 至 {IDLE_LOCK_MAX} 分钟之间"
        )
    return minutes
