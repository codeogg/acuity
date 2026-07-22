from pydantic import BaseModel, ConfigDict, Field


class DistrictCreate(BaseModel):
    name_zh: str = Field(min_length=1, max_length=100)
    name_en: str | None = Field(default=None, max_length=100)
    region: str | None = Field(default=None, max_length=50)


class DistrictUpdate(BaseModel):
    name_zh: str | None = Field(default=None, min_length=1, max_length=100)
    name_en: str | None = Field(default=None, max_length=100)
    region: str | None = Field(default=None, max_length=50)


class DistrictOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name_zh: str
    name_en: str | None
    region: str | None
