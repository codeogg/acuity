"""模块通用 schema。"""
from pydantic import BaseModel


class Page[T](BaseModel):
    items: list[T]
    total: int
    page: int
    page_size: int
