"""端到端验证：生成保单 PDF（claim #1）。"""
import asyncio
from pathlib import Path

import fitz

from src.db.session import async_session_factory
from src.modules.pdf_generation.fill_engine import generate_filled_pdf
from src.utils import storage

TEMPLATE_KEY = "templates/TPL311F0D5B/original.pdf"
CLAIM_ID = 1
CLINIC_ID = 4


def ensure_template_pdf() -> None:
    """若模板原件缺失，创建 A4 空白页供填充测试。"""
    local = Path(__file__).resolve().parents[1] / "storage" / TEMPLATE_KEY
    if local.exists():
        return
    local.parent.mkdir(parents=True, exist_ok=True)
    doc = fitz.open()
    doc.new_page(width=595, height=842)
    doc.save(str(local))
    doc.close()
    print(f"created template: {local}")


async def main() -> None:
    ensure_template_pdf()
    async with async_session_factory() as db:
        url = await generate_filled_pdf(db, CLAIM_ID, CLINIC_ID)
        await db.commit()
        print("generated_pdf_url:", url)

        pdf_bytes = storage.download_bytes(url)
        out = Path(__file__).resolve().parents[1] / "storage" / "generated" / "VERIFY_SUB20260704C9C156.pdf"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_bytes(pdf_bytes)
        print("saved:", out)

        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        page = doc[0]
        text = page.get_text("text")
        drawings = page.get_drawings()
        print("page_text_sample:", text[:500].replace("\n", " | "))
        print("drawing_count:", len(drawings))
        doc.close()

        # 长文本截断验证
        from src.db.models import ClaimSubmission

        claim = await db.get(ClaimSubmission, CLAIM_ID)
        assert claim
        long_diag = "慢性鼻竇炎伴鼻息肉" + "（附註）" * 30
        claim.final_field_values = {
            **(claim.final_field_values or {}),
            "diagnosis": long_diag,
        }
        await db.flush()
        url2 = await generate_filled_pdf(db, CLAIM_ID, CLINIC_ID)
        await db.commit()
        pdf2 = storage.download_bytes(url2)
        out2 = out.parent / "VERIFY_TRUNCATED.pdf"
        out2.write_bytes(pdf2)
        print("truncation_test_saved:", out2)


if __name__ == "__main__":
    asyncio.run(main())
