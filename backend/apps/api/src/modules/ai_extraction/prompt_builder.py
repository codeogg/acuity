"""动态构建病历提取 Prompt 与响应 JSON Schema。"""
from src.db.models import StandardField


def build_extraction_prompt(
    text: str, required_fields: list[StandardField]
) -> tuple[str, dict]:
    field_descriptions = "\n".join(
        f"- {f.field_code}（{f.field_name}）：{f.ai_extraction_hint or '从病历中提取对应信息'}"
        for f in required_fields
    )
    prompt = f"""你是医疗保险单据助理。请从以下病历文本中提取信息。
需要提取的字段：
{field_descriptions}

病历原文：
\"\"\"
{text}
\"\"\"

若某字段在病历中找不到依据，value 填 null，禁止编造信息。
"""
    response_schema = {
        "type": "object",
        "properties": {
            f.field_code: {
                "type": "object",
                "properties": {
                    "value": {"type": ["string", "null"]},
                    "confidence": {"type": "number"},
                },
                "required": ["value", "confidence"],
            }
            for f in required_fields
        },
    }
    return prompt, response_schema
