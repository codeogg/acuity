"""字段格式转换规则应用。对应 field_transform_rule.rule_type。"""
from datetime import datetime

from src.core.logging import get_logger

logger = get_logger(__name__)


def apply_transform(value: str | None, rule_type: str, rule_config: dict | None) -> str | None:
    if value is None:
        return None
    config = rule_config or {}
    try:
        if rule_type == "DATE_FORMAT":
            return _date_format(value, config.get("from", "%Y-%m-%d"), config.get("to", "%d/%m/%Y"))
        if rule_type == "ENUM_MAP":
            return str(config.get("map", {}).get(value, value))
        if rule_type == "CONCAT":
            return f"{config.get('prefix', '')}{value}{config.get('suffix', '')}"
        if rule_type == "SPLIT":
            sep = config.get("sep", " ")
            idx = int(config.get("index", 0))
            parts = value.split(sep)
            return parts[idx] if 0 <= idx < len(parts) else value
    except Exception as exc:
        logger.warning("transform_failed", rule_type=rule_type, error=str(exc))
        return value
    return value


def _date_format(value: str, from_fmt: str, to_fmt: str) -> str:
    # 支持传入常见 token（YYYY-MM-DD）或 strptime 格式
    from_fmt = _normalize_fmt(from_fmt)
    to_fmt = _normalize_fmt(to_fmt)
    try:
        return datetime.strptime(value, from_fmt).strftime(to_fmt)
    except ValueError:
        # 尝试 ISO
        return datetime.fromisoformat(value).strftime(to_fmt)


def _normalize_fmt(fmt: str) -> str:
    return (
        fmt.replace("YYYY", "%Y")
        .replace("MM", "%m")
        .replace("DD", "%d")
        .replace("HH", "%H")
        .replace("mm", "%M")
    )
