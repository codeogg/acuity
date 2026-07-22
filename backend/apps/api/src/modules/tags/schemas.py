from typing import Literal

from pydantic import BaseModel, Field

TagKind = Literal["type", "insurer", "specialty"]


class TagOut(BaseModel):
    id: int
    kind: TagKind
    label_zh: str
    label_en: str
    parent_id: int | None
    sort_order: int
    retired: bool

    model_config = {"from_attributes": True}


class TagCreate(BaseModel):
    kind: TagKind
    label_zh: str = Field(min_length=1, max_length=100)
    label_en: str = Field(min_length=1, max_length=100)
    parent_id: int | None = None
    sort_order: int | None = None


class TagUpdate(BaseModel):
    label_zh: str | None = Field(default=None, min_length=1, max_length=100)
    label_en: str | None = Field(default=None, min_length=1, max_length=100)
    parent_id: int | None = None
    sort_order: int | None = None


class TagRetireRequest(BaseModel):
    remap_to_tag_id: int | None = None


class TagRetireResult(BaseModel):
    tag: TagOut
    remapped_count: int


class TagVisibilityEntry(BaseModel):
    doctor_id: int
    tag_id: int
    visible: bool


class TagVisibilitySet(BaseModel):
    entries: list[TagVisibilityEntry]


class SuccessResponse(BaseModel):
    success: bool = True
