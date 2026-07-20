# 香港保险智能填单 SaaS —— 病历PDF提取模块 功能文档

> 本文档范围：**仅覆盖"上传PDF → 提取标准化字段JSON"这一段处理链路**。
> AI模型调整：原方案中 Claude 负责"字段提取"，Gemini 2.5 Flash 负责"文档分类"。由于 Claude 使用受限，**统一改为 Gemini 3.1 Pro Preview 承担分类 + 提取两项工作**（可用同一模型不同参数配置区分"轻量分类"与"精细提取"两种调用，也可以后续换回双模型架构，接口层已做好模型可替换设计）。

---

## 一、总体流程（11步，供AI coding逐步实现）

```
Step1 上传PDF
Step2 PDF预处理（本地，无AI）
Step3 OCR识别（PaddleOCR）
Step4 文档分类（Gemini 2.5 Flash 轻量调用）
Step5 多就诊检测/选择
Step6 Prompt Builder（本地拼装）
Step7 字段提取（Gemini 3.1 Pro Preview - 精细调用）
Step8 Validation Engine（本地规则校验，无AI）
Step9 Missing Detector（本地逻辑）
Step10 Insurance Mapper（本地映射，无AI）
Step11 输出标准JSON，交给人工审核前端（复用已有）
```

每一步都应做成**独立可测试的函数/服务**，输入输出严格用JSON契约约束，方便AI coding分步开发、分步单测。

---



## 二、通用设计原则（AI coding实现时必须遵守）

1. **AI只做两件事**：分类（Step4）、字段提取（Step7）。其余步骤禁止调用大模型，全部用确定性代码实现，保证可复现、可测试、成本可控。
2. **模型可替换**：所有对 Gemini 的调用必须封装在 `ai_service` 内部的抽象接口（如 `IDocumentClassifier` / `IFieldExtractor`），不允许在业务代码里直接拼 Gemini API 请求，方便未来切换模型（GPT、Qwen等）。
3. **字段状态三态**：任何提取字段必须是 `extracted` / `missing` / `low_confidence` 三种状态之一，禁止用空字符串代替"缺失"。
4. **溯源保留**：OCR阶段的 `bbox`、`page`、`confidence` 必须贯穿到最终输出，供人工审核定位原文。
5. **禁止模型猜测**：所有Prompt中必须显式声明"没有依据的信息一律标记为missing，不允许编造"。

---



## 三、分步骤功能需求



### Step1：上传PDF

**（复用已有服务，仅列出本模块需要的输入契约）**

- 输入：PDF文件、clinic_id、patient_id（如已知）
- 输出：`task_id`，状态 `Waiting`
- 存储：文件存入MinIO（已有），在 `document` 表建记录（已有表）

---



### Step2：PDF预处理

**目标**：判断每一页是否有可提取的文本层，决定走"直接抽取文本"还是"转图片走OCR"。

- 输入：`task_id` 对应的PDF文件路径
- 处理：
  - 使用 `PyMuPDF (fitz)` 逐页判断 `page.get_text()` 是否有实质内容
  - 有文本层 → 直接抽取文本，标记 `source=text_layer`
  - 无文本层（扫描件）→ 按 300 DPI 转 PNG，标记 `source=ocr_required`
- 输出（每页一条）：

```json
{
  "task_id": "xxx",
  "page": 1,
  "source": "text_layer" ,
  "text": "...",          // 有文本层时填充
  "image_path": null      // 无文本层时填充图片路径
}
```

- 落表：新增 `document_page`（若已有表，按此结构对齐字段即可）

---



### Step3：OCR识别

**目标**：对Step2标记为 `ocr_required` 的页面调用 PaddleOCR 3.x。

- 输入：图片路径
- 处理：调用 PaddleOCR，逐block输出文字、坐标、置信度
- 输出：

```json
{
  "task_id": "xxx",
  "page": 1,
  "blocks": [
    { "text": "Diagnosis", "bbox": [x1,y1,x2,y2], "confidence": 0.99 }
  ]
}
```

- 要求：**必须保留 bbox / confidence**，供Step11人工审核定位使用
- 落表：`ocr_result`（已有表，按需要补字段）

> 注：Step2产出的 `text_layer` 页面无需走OCR，但为了统一后续Prompt Builder的输入格式，建议将其也整理成同样的 `blocks` 结构（bbox可置空，confidence=1.0）。

---



### Step4：文档分类（Gemini 2.5 Flash）

**目标**：轻量调用，判断文档整体属性，不涉及具体字段提取。

- 输入：Step2/Step3整理出的全文本（可只取前N页 + 关键词密度高的段落，控制token）
- Prompt要点（示例）：

```
你是医疗文档分类器（Document Classifier）。
请根据输入文本判断以下内容，只输出JSON，不要输出多余文字：
1. document_type（如 Hospital_Discharge / Outpatient_Receipt / Insurance_Claim_Form / Bill 等）
2. language（如 zh-en / zh / en）
3. multiple_patient（是否包含多个病人信息）
4. multiple_visit（是否包含多次就诊记录）
5. insurance_company（如可识别，如 AIA/AXA/Bupa/Cigna，否则为 null）
6. need_visit_selector（multiple_visit为true时应为true）
```

- 输出：

```json
{
  "document_type": "Hospital_Discharge",
  "language": "zh-en",
  "multiple_patient": false,
  "multiple_visit": true,
  "insurance_company": "AIA",
  "need_visit_selector": true
}
```

- 落表：`document_classification`（已有表）

---



### Step5：多就诊检测/选择

**目标**：当Step4返回 `need_visit_selector=true` 时，列出候选就诊记录供前端人工选择。

- 输入：全文文本 + Step4分类结果
- 处理：调用 Gemini（同一模型，轻量Prompt），提取"就诊分段"候选列表，**不做字段级提取**，只做粗粒度切分
- Prompt要点：

```
请从文本中识别出所有独立的"就诊记录"分段，每段给出：
- visit_index
- visit_date（如可识别）
- summary（一句话摘要，如诊断名称）
- text_range（该就诊记录在原文中的大致起止位置或页码）
只输出JSON数组，不要编造未出现的信息。
```

- 输出：

```json
[
  { "visit_index": 1, "visit_date": "2025-01-10", "summary": "Appendicitis", "page_range": [1,2] },
  { "visit_index": 2, "visit_date": "2025-03-01", "summary": "Gallstone", "page_range": [3,4] }
]
```

- 前端（复用已有）展示供用户勾选，用户选择结果回传 `visit_index`
- 落表：`visit`（已有表）

---



### Step6：Prompt Builder（本地逻辑，无AI）

**目标**：把OCR/文本结果 + 分类结果 + 用户选择的就诊信息 + 字段Schema，拼装成干净的、结构化的提取Prompt正文。

- 输入：
  - Step2/3整理的文本（若有多就诊，只取用户选中的 `page_range` 对应内容）
  - Step4分类结果
  - Step5用户选择的visit（如适用）
  - 目标字段Schema（保险公司通用字段集，需你提前定义，如 `patient_name, dob, hkid, diagnosis, admission_date, discharge_date, doctor_name, hospital_name, total_amount ...`）
- 处理：纯字符串拼装，无需调用任何模型，示例格式：

```
# Document Type
Hospital Discharge

# Visit Selected
Visit2 (2025-03-01, Gallstone)

# OCR Content
Diagnosis:
Acute appendicitis

Doctor:
CHAN

# Target Schema
patient_name, dob, hkid, diagnosis, admission_date, discharge_date, doctor_name, hospital_name, total_amount
```

- 输出：一个字符串（供Step7直接作为user message发送）

---



### Step7：字段提取（Gemini 3.1 Pro Preview，精细调用）

**目标**：核心步骤，把Prompt Builder的输出交给Gemini做结构化字段抽取。

- 输入：Step6拼装好的Prompt正文
- System Prompt要点（示例）：

```
你是香港保险理赔文档字段提取专家。
规则：
1. 只提取文本中明确出现的信息，不允许推测或编造。
2. 每个字段必须输出 value、status、confidence 三个属性。
3. status 取值：extracted（明确提取到）/ missing（文本中未出现）/ low_confidence（提取到但不确定，如字迹模糊、OCR置信度低）。
4. 严格按照给定Schema输出JSON，不要新增字段，不要输出JSON以外的任何文字。
```

- 输出示例：

```json
{
  "patient_name": { "value": "CHAN TAI MAN", "status": "extracted", "confidence": 0.97 },
  "hkid": { "value": null, "status": "missing", "confidence": 0.0 },
  "diagnosis": { "value": "Acute appendicitis", "status": "extracted", "confidence": 0.93 }
}
```

- 落表：`extraction_result`（已有表）

---



### Step8：Validation Engine（本地规则，无AI）

**目标**：不信任模型输出的格式正确性，用代码强制校验。

- 输入：Step7输出的JSON
- 校验规则（示例，需按你的字段清单补全）：
  - `dob` / `admission_date` / `discharge_date`：是否为合法日期，统一转为 ISO 格式 `YYYY-MM-DD`
  - `hkid`：是否符合香港身份证号格式（含校验位算法）
  - `total_amount`：是否为合法数字，去除货币符号/千分位后转为 float
  - `policy_no`：是否符合对应保险公司的格式规则（可先做通用格式，后续接入Step10 Mapper后再按保司细化）
- 处理：校验失败的字段，将 `status` 强制改写为 `low_confidence`，并附加 `validation_error` 说明原因
- 输出：校验后的JSON（结构同Step7，新增 `validation_error` 字段，正常时为null）

---



### Step9：Missing Detector（本地逻辑，无AI）

**目标**：统一空值语义，确保前端不会显示"空白"而是明确的"缺失"标记。

- 输入：Step8输出
- 处理：
  - 任何 `value` 为 `null`/`""`/`"N/A"` 等的字段，强制 `status = "missing"`
  - 对Schema中定义了但Step7完全没有返回的字段，补齐为 `missing`
- 输出：字段完整（覆盖全部Schema字段）、状态明确的JSON

---



### Step10：Insurance Mapper（本地映射，无AI）

**目标**：把内部统一字段名，映射为目标保险公司表单所需的字段名。

- 输入：Step9输出的标准JSON + `insurance_company`（来自Step4，或用户手动指定）
- 处理：查表映射，例如：


| 内部字段         | AIA            | AXA           | Bupa             |
| ------------ | -------------- | ------------- | ---------------- |
| patient_name | insured_name   | claimant_name | member_name      |
| diagnosis    | diagnosis_desc | diagnosis     | diagnosis_detail |


- 映射表建议做成配置文件/表（`insurance_template` 已有表），后续新增保险公司只需加配置，不改代码
- 输出：按目标保司字段名重组后的JSON

---



### Step11：交付人工审核（复用已有前端/审核服务）

- 输入：Step10输出 + Step3保留的 `bbox`/`page`/`confidence`
- 规则：`confidence < 0.8` 或 `status != extracted` 的字段，前端标黄，点击可定位到PDF原文位置
- 本模块只需保证：**输出JSON中每个字段都能追溯到原始OCR block的bbox/page**，其余交互逻辑由已有审核前端处理

---



## 四、需要新建/复用的表（仅列出与本模块强相关的）


| 表名                      | 说明                  | 状态      |
| ----------------------- | ------------------- | ------- |
| document_page           | Step2输出，每页文本/图片路径   | 需新建（如无） |
| ocr_result              | Step3输出，OCR blocks  | 复用已有    |
| document_classification | Step4输出             | 复用已有    |
| visit                   | Step5输出，候选就诊 + 用户选择 | 复用已有    |
| extraction_result       | Step7/8/9输出，字段级结果   | 复用已有    |
| insurance_template      | Step10映射配置          | 复用已有    |


---



## 五、接口契约建议（供AI coding按此拆分为独立可调用的服务方法）

```
POST /internal/pdf/preprocess        (Step2)   → document_page[]
POST /internal/ocr/run               (Step3)   → ocr_result[]
POST /internal/ai/classify           (Step4)   → document_classification
POST /internal/ai/detect-visits      (Step5)   → visit[]
POST /internal/prompt/build          (Step6)   → prompt_text (string)
POST /internal/ai/extract-fields     (Step7)   → extraction_result (raw)
POST /internal/validate              (Step8)   → extraction_result (validated)
POST /internal/detect-missing        (Step9)   → extraction_result (final)
POST /internal/map-to-insurance      (Step10)  → mapped_result
```

> 建议实现为一个 Celery 任务链（chain），每一步的输出作为下一步的输入，任一步失败都要记录 `task_id` 对应的失败阶段，方便排查。

---



## 六、验收标准（建议）

1. 对于清晰扫描件/电子病历，端到端字段提取准确率 ≥ 90%（作为MVP阶段目标，后续再提升至95%）
2. 每个字段必须有明确的 `status`，不允许出现"看起来是空的但状态是extracted"这类矛盾
3. 多就诊文档必须能正确切分并支持用户选择
4. 更换保险公司只需修改 `insurance_template` 配置，不需要改代码
5. 更换AI模型（如未来从Gemini换回Claude或GPT）只需替换 `ai_service` 内部实现，不影响Step2/3/8/9/10

---

后续你可以按 Step1 → Step11 的顺序，把每一节的"输入/处理/输出"贴给AI coding，让它逐步实现并单测，这样每一步都是独立可验证的，避免一次性生成整条链路导致难以调试。