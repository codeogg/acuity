"""模拟审计元数据：@AuditSensitive 与可选实体快照 loader。"""
from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any, TypeVar

from fastapi import Request

F = TypeVar("F", bound=Callable[..., Any])

_SENSITIVE_ATTR = "__audit_sensitive__"
_SNAPSHOT_ATTR = "__audit_snapshot_loader__"

SnapshotLoader = Callable[[Request], Awaitable[dict[str, Any] | None]]


@dataclass(frozen=True)
class AuditSensitiveMeta:
    resource: str
    id_param: str


def AuditSensitive(*, resource: str, id_param: str) -> Callable[[F], F]:
    """敏感只读标记：放行后追加 resource_type + resource_id（不存响应体）。"""

    def decorator(fn: F) -> F:
        setattr(fn, _SENSITIVE_ATTR, AuditSensitiveMeta(resource=resource, id_param=id_param))
        return fn

    return decorator


def audit_entity_snapshot(loader: SnapshotLoader) -> Callable[[F], F]:
    """可选：MUTATING 写操作前后快照加载器。未挂载则只记 request_params。"""

    def decorator(fn: F) -> F:
        setattr(fn, _SNAPSHOT_ATTR, loader)
        return fn

    return decorator


def _walk_endpoint(endpoint: Any) -> Any:
    seen: set[int] = set()
    current: Any = endpoint
    while current is not None and id(current) not in seen:
        yield current
        seen.add(id(current))
        current = getattr(current, "__wrapped__", None)


def resolve_audit_sensitive(endpoint: Any) -> AuditSensitiveMeta | None:
    for current in _walk_endpoint(endpoint):
        meta = getattr(current, _SENSITIVE_ATTR, None)
        if isinstance(meta, AuditSensitiveMeta):
            return meta
    return None


def resolve_snapshot_loader(endpoint: Any) -> SnapshotLoader | None:
    for current in _walk_endpoint(endpoint):
        loader = getattr(current, _SNAPSHOT_ATTR, None)
        if callable(loader):
            return loader  # type: ignore[return-value]
    return None


def resolve_resource_id(request: Request, id_param: str) -> str | None:
    if id_param in request.path_params:
        return str(request.path_params[id_param])
    if id_param in request.query_params:
        return str(request.query_params[id_param])
    return None
