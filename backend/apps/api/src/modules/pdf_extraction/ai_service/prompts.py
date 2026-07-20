"""Step4 文档分类 Prompt 与 JSON Schema。"""
from __future__ import annotations

# Step7 字段提取共用硬性规则（写入 prompt 正文与 system 指令）
EXTRACTION_FIELD_MAPPING_RULES = """# Field Mapping Rules（硬性）
- 只填文档中明确出现的值；不得臆造、推断、联想补充或跨字段搬运。
- amount_total（总金额）仅取单据上明确标注的「总额 / Total / Grand Total / 应付总额」等汇总金额。
- Consultation fee / 诊金 / 咨询费 / 诊察费 等单项诊疗收费不得填入 amount_total。
- 若文档仅有 Consultation fee 而无明确总金额，amount_total 必须标为 missing（value=null），不得用诊金凑数。
- 不得将药费、检查费、挂号费等明细行单项金额当作 amount_total，除非该单据仅有一项且原文明确即为总额。
"""

CLASSIFICATION_RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "document_type": {
            "type": "string",
            "description": "如 Hospital_Discharge / Outpatient_Receipt / Insurance_Claim_Form / Bill",
        },
        "language": {
            "type": "string",
            "description": "zh-en / zh / en",
        },
        "multiple_patient": {"type": "boolean"},
        "multiple_visit": {"type": "boolean"},
        "insurance_company": {"type": "string", "nullable": True},
        "need_visit_selector": {"type": "boolean"},
    },
    "required": [
        "document_type",
        "language",
        "multiple_patient",
        "multiple_visit",
        "insurance_company",
        "need_visit_selector",
    ],
}


def build_classification_prompt(document_text: str) -> str:
    return f"""你是医疗文档分类器（Document Classifier）。
请根据输入文本判断以下内容，只输出 JSON，不要输出多余文字：
1. document_type（如 Hospital_Discharge / Outpatient_Receipt / Insurance_Claim_Form / Bill 等）
2. language（如 zh-en / zh / en）
3. multiple_patient（是否包含多个病人信息）
4. multiple_visit（是否包含多次就诊记录）
5. insurance_company（如可识别，如 AIA/AXA/Bupa/Cigna，否则为 null）
6. need_visit_selector（multiple_visit 为 true 时应为 true）

硬性规则：
- 只能依据下方文本判断，没有依据的信息不得编造。
- 无法判断时，document_type 用 Unknown，insurance_company 用 null。
- 不要提取具体病历字段，只做文档级分类。

文档文本：
\"\"\"
{document_text}
\"\"\"
"""


VISIT_DETECTION_RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "visits": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "visit_index": {"type": "integer"},
                    "visit_date": {"type": "string", "nullable": True},
                    "summary": {"type": "string", "nullable": True},
                    "page_range": {
                        "type": "array",
                        "items": {"type": "integer"},
                    },
                },
                "required": ["visit_index", "visit_date", "summary", "page_range"],
            },
        }
    },
    "required": ["visits"],
}


def build_visit_detection_prompt(
    document_text: str,
    *,
    document_type: str,
    language: str,
    total_pages: int,
) -> str:
    return f"""你是医疗文档就诊分段器（Visit Segment Detector）。
请从文本中识别所有独立的「就诊记录」分段，只输出 JSON，不要输出多余文字。

每段就诊需包含：
- visit_index（从 1 开始的序号）
- visit_date（如可识别，ISO 格式 YYYY-MM-DD，否则 null）
- summary（一句话摘要，如诊断名称；无法判断则为 null）
- page_range（该就诊在文档中的页码范围 [起始页, 结束页]，页码从 1 开始，不超过总页数 {total_pages}）

文档类型：{document_type}
语言：{language}
总页数：{total_pages}

硬性规则：
- 只能依据下方文本判断，没有依据的信息不得编造。
- 不做字段级提取，只做粗粒度就诊切分。
- 若只能识别出 1 次就诊，仍输出长度为 1 的数组。
- page_range 必须落在 [1, {total_pages}] 内，且起始页 <= 结束页。

文档文本：
\"\"\"
{document_text}
\"\"\"
"""


def field_extraction_response_schema(fields: list) -> dict:
    return {
        "type": "object",
        "properties": {
            field.field_code: {
                "type": "object",
                "properties": {
                    "value": {"type": "string", "nullable": True},
                    "status": {
                        "type": "string",
                        "enum": ["extracted", "missing", "low_confidence"],
                    },
                    "confidence": {"type": "number"},
                },
                "required": ["value", "status", "confidence"],
            }
            for field in fields
        },
        "required": [field.field_code for field in fields],
    }


def build_field_extraction_prompt(prompt_text: str) -> str:
    return f"""你是香港保险理赔文档字段提取专家。

规则：
1. 只提取文本中明确出现的信息，不允许推测、编造或联想补充。
2. 每个字段必须输出 value、status、confidence 三个属性。
3. status 取值：extracted（明确提取到）/ missing（文本中未出现）/ low_confidence（提取到但不确定）。
4. 严格按照给定 Schema 输出 JSON，不要新增字段，不要输出 JSON 以外的任何文字。
5. 没有依据的信息一律标记为 missing，value 必须为 null。
6. Consultation fee / 诊金 / 咨询费 等单项收费不得填入 amount_total；无明确总额时 amount_total 标 missing。
7. 不得将相似但不同的标签/数值张冠李戴到其它字段（如预约编号≠收据号、诊金≠总金额）。

{prompt_text}
"""

