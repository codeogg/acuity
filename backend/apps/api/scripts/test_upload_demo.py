"""上传 sample/demo.pdf 并验证 arq 入队与解析。"""
import asyncio
import sys
from pathlib import Path

import httpx
import redis
from sqlalchemy import select

ROOT = Path(__file__).resolve().parents[3]
PDF = ROOT / "sample" / "demo.pdf"

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.config import settings
from src.db.models import PolicyTemplate, TemplateField
from src.db.session import async_session_factory

TERMINAL = {"AUTO_PARSED", "AI_ASSISTED", "PARSE_FAILED", "PUBLISHED", "ANNOTATED"}


async def main() -> None:
    if not PDF.exists():
        print("ERROR: demo.pdf not found at", PDF)
        sys.exit(1)

    async with httpx.AsyncClient(base_url="http://localhost:8000", timeout=120) as client:
        await client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
        companies = (await client.get("/api/admin/insurance-companies?page_size=1")).json()
        company_id = companies["items"][0]["id"]

        with PDF.open("rb") as f:
            resp = await client.post(
                "/api/admin/templates",
                data={
                    "company_id": str(company_id),
                    "template_name": "demo测试模板-arq验证",
                },
                files={"file": ("demo.pdf", f, "application/pdf")},
            )
        print("upload:", resp.status_code, resp.text[:300])
        resp.raise_for_status()
        template_id = resp.json()["id"]
        print("template_id:", template_id)

    async with async_session_factory() as db:
        tpl = await db.get(PolicyTemplate, template_id)
        assert tpl
        print("DB after upload: job_id=", tpl.parse_job_id, "status=", tpl.parse_status)

    rds = redis.from_url(settings.REDIS_URL, decode_responses=True)
    prog = rds.get(f"template_parse_progress:{template_id}")
    print("redis progress:", prog)
    arq_keys = [k for k in rds.keys("arq:*")]
    print("arq redis keys:", len(arq_keys))
    rds.close()

    if not tpl.parse_job_id:
        print("WARN: parse_job_id is empty — task may have run inline, not queued")

    final_status = None
    for i in range(60):
        async with httpx.AsyncClient(base_url="http://localhost:8000", timeout=30) as client:
            await client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
            progress = (await client.get(f"/api/admin/templates/{template_id}/parse-progress")).json()
            detail = (await client.get(f"/api/admin/templates/{template_id}")).json()
        final_status = detail["parse_status"]
        print(
            f"poll {i}: status={final_status} percent={progress.get('percent')} "
            f"msg={progress.get('message')}"
        )
        if final_status in TERMINAL:
            break
        await asyncio.sleep(1.5)

    async with async_session_factory() as db:
        tpl = await db.get(PolicyTemplate, template_id)
        fields = (
            await db.execute(
                select(TemplateField).where(TemplateField.template_id == template_id)
            )
        ).scalars().all()
        assert tpl
        print("FINAL:", tpl.parse_status, "fields=", len(fields), "pages=", tpl.page_count)
        if tpl.parse_error:
            print("parse_error:", tpl.parse_error[:500])

    if final_status not in TERMINAL:
        print("FAIL: parse did not reach terminal state in time")
        sys.exit(1)
    if final_status == "PARSE_FAILED":
        print("FAIL: parse failed")
        sys.exit(1)
    print("OK: arq parse completed")


if __name__ == "__main__":
    asyncio.run(main())
