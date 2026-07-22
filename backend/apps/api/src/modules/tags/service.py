from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.exceptions import NotFoundException, ValidationException
from src.db.models import Doctor, FormTag, TagVisibility
from src.modules.tags.schemas import (
    TagCreate,
    TagKind,
    TagOut,
    TagRetireResult,
    TagUpdate,
    TagVisibilityEntry,
)


def _to_out(tag: FormTag) -> TagOut:
    return TagOut.model_validate(tag)


async def list_tags(
    db: AsyncSession, *, kind: TagKind | None = None
) -> list[FormTag]:
    stmt = select(FormTag).order_by(FormTag.kind.asc(), FormTag.sort_order.asc(), FormTag.id.asc())
    if kind:
        stmt = stmt.where(FormTag.kind == kind)
    return list((await db.execute(stmt)).scalars().all())


async def get_tag(db: AsyncSession, tag_id: int) -> FormTag:
    tag = await db.get(FormTag, tag_id)
    if tag is None:
        raise NotFoundException("標籤不存在")
    return tag


async def create_tag(db: AsyncSession, data: TagCreate) -> FormTag:
    if data.parent_id is not None:
        parent = await get_tag(db, data.parent_id)
        if parent.kind != data.kind:
            raise ValidationException("父標籤類型必須一致")
        if parent.retired:
            raise ValidationException("不能掛到已停用的父標籤下")

    sort_order = data.sort_order
    if sort_order is None:
        max_sort = (
            await db.execute(
                select(func.coalesce(func.max(FormTag.sort_order), 0)).where(
                    FormTag.kind == data.kind
                )
            )
        ).scalar_one()
        sort_order = int(max_sort) + 1

    tag = FormTag(
        kind=data.kind,
        label_zh=data.label_zh.strip(),
        label_en=data.label_en.strip(),
        parent_id=data.parent_id,
        sort_order=sort_order,
        retired=False,
    )
    db.add(tag)
    await db.flush()
    return tag


async def update_tag(db: AsyncSession, tag_id: int, data: TagUpdate) -> FormTag:
    tag = await get_tag(db, tag_id)
    values = data.model_dump(exclude_unset=True)
    if "parent_id" in values and values["parent_id"] is not None:
        parent = await get_tag(db, values["parent_id"])
        if parent.kind != tag.kind:
            raise ValidationException("父標籤類型必須一致")
        if parent.id == tag.id:
            raise ValidationException("標籤不能成為自己的父級")
        if parent.retired:
            raise ValidationException("不能掛到已停用的父標籤下")
    if "label_zh" in values and values["label_zh"] is not None:
        values["label_zh"] = values["label_zh"].strip()
    if "label_en" in values and values["label_en"] is not None:
        values["label_en"] = values["label_en"].strip()
    for key, value in values.items():
        setattr(tag, key, value)
    await db.flush()
    return tag


async def retire_tag(
    db: AsyncSession, tag_id: int, *, remap_to_tag_id: int | None
) -> TagRetireResult:
    tag = await get_tag(db, tag_id)
    if tag.retired:
        return TagRetireResult(tag=_to_out(tag), remapped_count=0)

    remapped = 0
    if remap_to_tag_id is not None:
        target = await get_tag(db, remap_to_tag_id)
        if target.retired:
            raise ValidationException("不能重映射到已停用的標籤")
        if target.kind != tag.kind:
            raise ValidationException("重映射目標必須是相同類型的標籤")
        if target.id == tag.id:
            raise ValidationException("不能重映射到自身")

        # Visibility rows: never orphan — move to the replacement tag.
        vis_rows = list(
            (
                await db.execute(
                    select(TagVisibility).where(TagVisibility.tag_id == tag.id)
                )
            )
            .scalars()
            .all()
        )
        for row in vis_rows:
            existing = (
                await db.execute(
                    select(TagVisibility).where(
                        TagVisibility.doctor_id == row.doctor_id,
                        TagVisibility.tag_id == target.id,
                    )
                )
            ).scalar_one_or_none()
            if existing is not None:
                # Keep the more restrictive (hidden) if either hides.
                existing.visible = existing.visible and row.visible
                await db.delete(row)
            else:
                row.tag_id = target.id
            remapped += 1

        # Child tags: re-parent under the replacement (or clear if same).
        await db.execute(
            update(FormTag)
            .where(FormTag.parent_id == tag.id)
            .values(parent_id=target.id)
        )
    else:
        # No remap target: drop visibility overrides for this tag (default = visible).
        vis_rows = list(
            (
                await db.execute(
                    select(TagVisibility).where(TagVisibility.tag_id == tag.id)
                )
            )
            .scalars()
            .all()
        )
        for row in vis_rows:
            await db.delete(row)
            remapped += 1
        await db.execute(
            update(FormTag).where(FormTag.parent_id == tag.id).values(parent_id=None)
        )

    tag.retired = True
    await db.flush()
    return TagRetireResult(tag=_to_out(tag), remapped_count=remapped)


async def list_visibility(
    db: AsyncSession, *, doctor_id: int | None = None
) -> list[TagVisibilityEntry]:
    stmt = select(TagVisibility)
    if doctor_id is not None:
        stmt = stmt.where(TagVisibility.doctor_id == doctor_id)
    rows = list((await db.execute(stmt)).scalars().all())
    return [
        TagVisibilityEntry(
            doctor_id=row.doctor_id, tag_id=row.tag_id, visible=row.visible
        )
        for row in rows
    ]


async def set_visibility(
    db: AsyncSession, entries: list[TagVisibilityEntry]
) -> None:
    for entry in entries:
        doctor = await db.get(Doctor, entry.doctor_id)
        if doctor is None:
            raise NotFoundException(f"醫生不存在：{entry.doctor_id}")
        tag = await get_tag(db, entry.tag_id)
        if tag.retired:
            raise ValidationException(f"不能設定已停用標籤的可見性：{entry.tag_id}")

        existing = (
            await db.execute(
                select(TagVisibility).where(
                    TagVisibility.doctor_id == entry.doctor_id,
                    TagVisibility.tag_id == entry.tag_id,
                )
            )
        ).scalar_one_or_none()
        if existing is not None:
            existing.visible = entry.visible
        else:
            db.add(
                TagVisibility(
                    doctor_id=entry.doctor_id,
                    tag_id=entry.tag_id,
                    visible=entry.visible,
                )
            )
    await db.flush()
