"""标准字段 code 迁移：seed 同步 + 模板映射 + 历史 claim / 提取记录 JSON 键重命名。

运行（apps/api 目录）：
  python scripts/migrate_standard_field_codes.py          # 执行迁移
  python scripts/migrate_standard_field_codes.py --dry-run # 仅预览

阶段：
  1. upsert seed 标准域/字段（不删旧字段）
  2. 更新 template_field_mapping / claim_field_change_log 的 standard_field_id
  3. 重命名 claim / extraction 相关 JSON 中的旧 field code
  4. 全量 seed 同步，删除废弃字段与信息域
"""
from __future__ import annotations

import argparse
import asyncio
from typing import Any

from sqlalchemy import select

from src.core.logging import configure_logging, get_logger
from src.db.models import (
    ClaimFieldChangeLog,
    ClaimSubmission,
    ExtractionMappedResult,
    ExtractionPrompt,
    ExtractionResult,
    ExtractionReviewOutput,
    StandardField,
    TemplateFieldMapping,
)
from src.db.session import async_session_factory
from src.seed import sync_standard_catalog

logger = get_logger(__name__)

# 旧 code → seed 标准 code
FIELD_CODE_RENAMES: dict[str, str] = {
    "patient_id_no": "hkid",
    "patient_gender": "gender",
    "patient_birth_date": "dob",
    "diagnosis": "diagnosis_text",
    "total_fee": "amount_total",
    "cpt_code": "cpt",
    "insurer_name_extracted": "insurer_name",
    "patient_name": "patient_name_cn",
}

# 无标准对应、应从 JSON 中剔除
FIELD_CODES_TO_DROP: frozenset[str] = frozenset(
    {"symptoms", "treatment"}
)


def migrate_dict_keys(data: dict[str, Any] | None) -> dict[str, Any] | None:
    """重命名/剔除 JSON 对象顶层 field code 键；canonical 键优先于旧键。"""
    if not data:
        return data

    result: dict[str, Any] = {}
    for key, value in data.items():
        if key in FIELD_CODES_TO_DROP:
            continue
        if key in FIELD_CODE_RENAMES:
            continue
        result[key] = value

    for old_key, new_key in FIELD_CODE_RENAMES.items():
        if old_key not in data or old_key in FIELD_CODES_TO_DROP:
            continue
        if new_key in result and _has_meaningful_value(result[new_key]):
            continue
        result[new_key] = data[old_key]

    return result


def migrate_field_codes(codes: list | None) -> list | None:
    if not codes:
        return codes
    seen: set[str] = set()
    out: list[str] = []
    for code in codes:
        if code in FIELD_CODES_TO_DROP:
            continue
        new_code = FIELD_CODE_RENAMES.get(code, code)
        if new_code not in seen:
            out.append(new_code)
            seen.add(new_code)
    return out


def migrate_mapped_result_fields(fields: dict[str, Any] | None) -> dict[str, Any] | None:
    """Step10 映射结果：更新嵌套 source_field。"""
    if not fields:
        return fields
    out: dict[str, Any] = {}
    for key, value in fields.items():
        if not isinstance(value, dict):
            out[key] = value
            continue
        payload = dict(value)
        source = payload.get("source_field")
        if isinstance(source, str):
            if source in FIELD_CODES_TO_DROP:
                continue
            payload["source_field"] = FIELD_CODE_RENAMES.get(source, source)
        out[key] = payload
    return out


def _has_meaningful_value(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, dict):
        inner = value.get("value")
        if inner is None:
            return bool(value)
        if isinstance(inner, str):
            return bool(inner.strip())
        return True
    return True


async def _field_id_maps(db) -> tuple[dict[str, int], dict[int, str]]:
    rows = (await db.execute(select(StandardField))).scalars().all()
    code_to_id = {r.field_code: r.id for r in rows}
    id_to_code = {r.id: r.field_code for r in rows}
    return code_to_id, id_to_code


async def migrate_template_mappings(db, *, dry_run: bool) -> int:
    code_to_id, id_to_code = await _field_id_maps(db)
    updated = 0

    mappings = (
        await db.execute(
            select(TemplateFieldMapping).where(
                TemplateFieldMapping.standard_field_id.isnot(None)
            )
        )
    ).scalars().all()

    for mapping in mappings:
        old_id = mapping.standard_field_id
        old_code = id_to_code.get(old_id)
        if not old_code or old_code not in FIELD_CODE_RENAMES:
            continue
        new_code = FIELD_CODE_RENAMES[old_code]
        new_id = code_to_id.get(new_code)
        if not new_id:
            logger.warning("migrate_mapping_missing_target", old_code=old_code, new_code=new_code)
            continue
        if mapping.standard_field_id == new_id:
            continue
        logger.info(
            "migrate_template_mapping",
            mapping_id=mapping.id,
            old_code=old_code,
            new_code=new_code,
        )
        if not dry_run:
            mapping.standard_field_id = new_id
        updated += 1

    return updated


async def migrate_change_logs(db, *, dry_run: bool) -> int:
    code_to_id, id_to_code = await _field_id_maps(db)
    updated = 0
    deleted = 0

    logs = (await db.execute(select(ClaimFieldChangeLog))).scalars().all()
    by_submission: dict[int, set[int]] = {}
    for log in logs:
        by_submission.setdefault(log.submission_id, set()).add(log.standard_field_id)

    for log in logs:
        old_id = log.standard_field_id
        old_code = id_to_code.get(old_id)
        if not old_code or old_code not in FIELD_CODE_RENAMES:
            continue
        new_code = FIELD_CODE_RENAMES[old_code]
        new_id = code_to_id.get(new_code)
        if not new_id:
            continue

        existing = by_submission.get(log.submission_id, set())
        if new_id in existing and new_id != old_id:
            logger.info(
                "migrate_change_log_drop_duplicate",
                log_id=log.id,
                submission_id=log.submission_id,
                old_code=old_code,
                new_code=new_code,
            )
            if not dry_run:
                await db.delete(log)
            deleted += 1
            continue

        logger.info(
            "migrate_change_log",
            log_id=log.id,
            old_code=old_code,
            new_code=new_code,
        )
        if not dry_run:
            log.standard_field_id = new_id
            existing.discard(old_id)
            existing.add(new_id)
        updated += 1

    return updated + deleted


async def migrate_claim_json(db, *, dry_run: bool) -> int:
    count = 0
    claims = (await db.execute(select(ClaimSubmission))).scalars().all()
    for claim in claims:
        changed = False
        new_ai = migrate_dict_keys(claim.ai_raw_result)
        new_final = migrate_dict_keys(claim.final_field_values)
        if new_ai != claim.ai_raw_result:
            changed = True
        if new_final != claim.final_field_values:
            changed = True

        if changed:
            logger.info("migrate_claim_json", claim_id=claim.id)
            if not dry_run:
                claim.ai_raw_result = new_ai
                claim.final_field_values = new_final
                if not claim.patient_name and new_final:
                    claim.patient_name = (
                        new_final.get("patient_name_cn")
                        or new_final.get("patient_name_en")
                    )
            count += 1
    return count


async def migrate_extraction_json(db, *, dry_run: bool) -> dict[str, int]:
    stats = {
        "review": 0,
        "result": 0,
        "prompt": 0,
        "mapped": 0,
    }

    reviews = (await db.execute(select(ExtractionReviewOutput))).scalars().all()
    for row in reviews:
        new_std = migrate_dict_keys(row.standard_fields)
        new_edited = migrate_dict_keys(row.edited_fields)
        if new_std != row.standard_fields or new_edited != row.edited_fields:
            logger.info("migrate_review_output", review_id=row.id, task_id=row.task_id)
            if not dry_run:
                row.standard_fields = new_std or {}
                row.edited_fields = new_edited
            stats["review"] += 1

    results = (await db.execute(select(ExtractionResult))).scalars().all()
    for row in results:
        new_fields = migrate_dict_keys(row.fields)
        if new_fields != row.fields:
            logger.info("migrate_extraction_result", result_id=row.id, task_id=row.task_id)
            if not dry_run:
                row.fields = new_fields or {}
            stats["result"] += 1

    prompts = (await db.execute(select(ExtractionPrompt))).scalars().all()
    for row in prompts:
        new_codes = migrate_field_codes(row.field_codes)
        if new_codes != row.field_codes:
            logger.info("migrate_extraction_prompt", prompt_id=row.id, task_id=row.task_id)
            if not dry_run:
                row.field_codes = new_codes or []
            stats["prompt"] += 1

    mapped_rows = (await db.execute(select(ExtractionMappedResult))).scalars().all()
    for row in mapped_rows:
        new_fields = migrate_mapped_result_fields(row.fields)
        new_unmapped = migrate_field_codes(row.unmapped_fields)
        if new_fields != row.fields or new_unmapped != row.unmapped_fields:
            logger.info("migrate_mapped_result", mapped_id=row.id, task_id=row.task_id)
            if not dry_run:
                row.fields = new_fields or {}
                row.unmapped_fields = new_unmapped or []
            stats["mapped"] += 1

    return stats


async def run_migration(*, dry_run: bool) -> None:
    configure_logging()
    logger.info("migrate_start", dry_run=dry_run)

    async with async_session_factory() as db:
        logger.info("migrate_phase", phase=1, action="upsert_seed_without_delete")
        await sync_standard_catalog(db, remove_stale=False)

        logger.info("migrate_phase", phase=2, action="template_field_mapping")
        n_mappings = await migrate_template_mappings(db, dry_run=dry_run)

        logger.info("migrate_phase", phase=3, action="claim_field_change_log")
        n_logs = await migrate_change_logs(db, dry_run=dry_run)

        logger.info("migrate_phase", phase=4, action="claim_json")
        n_claims = await migrate_claim_json(db, dry_run=dry_run)

        logger.info("migrate_phase", phase=5, action="extraction_json")
        extraction_stats = await migrate_extraction_json(db, dry_run=dry_run)

        if dry_run:
            await db.rollback()
            logger.info(
                "migrate_dry_run_summary",
                template_mappings=n_mappings,
                change_logs=n_logs,
                claims=n_claims,
                **extraction_stats,
            )
            return

        await db.commit()
        logger.info(
            "migrate_data_done",
            template_mappings=n_mappings,
            change_logs=n_logs,
            claims=n_claims,
            **extraction_stats,
        )

    async with async_session_factory() as db:
        logger.info("migrate_phase", phase=6, action="seed_full_sync_remove_stale")
        await sync_standard_catalog(db, remove_stale=True)
        await db.commit()

    logger.info("migrate_done")


def main() -> None:
    parser = argparse.ArgumentParser(description="标准字段 code 迁移")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="仅预览变更，不写库",
    )
    args = parser.parse_args()
    asyncio.run(run_migration(dry_run=args.dry_run))


if __name__ == "__main__":
    main()
