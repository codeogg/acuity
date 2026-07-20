# PDF填充 · 保存 · 预览 · 打印 —— 功能技术规格

> 承接医生端字段核对完成后的下一步：把确认后的标准字段值填入保单模板，生成新PDF存档，供医生预览和打印。

---

## 0. 在整体流程里的位置

```
医生核对字段(status=AI_FILLED) → 点击"确认并生成保单"
        ↓
POST /api/doctor/claims/{id}/confirm   （校验必填字段完整性，status→CONFIRMED）
        ↓
POST /api/doctor/claims/{id}/generate-pdf   （本文档的核心：填充引擎生成新PDF）
        ↓
前端跳转Step3：预览生成的PDF（iframe嵌入）
        ↓
医生点击"打印" → 调出系统打印对话框 → 点击"标记已打印"
        ↓
POST /api/doctor/claims/{id}/mark-printed   （status→PRINTED）
```

---

## 1. 数据输入：扁平化字段值

填充引擎的唯一输入是`claim_submission.final_field_values`，格式为**扁平键值对**，不携带核对阶段用到的置信度/来源/冲突信息：

```json
{
  "patient_name_cn": "陈大文",
  "diagnosis": "急性阑尾炎",
  "visit_date": "2026-07-04",
  "patient_gender": "男",
  "total_fee": 1580
}
```

**规则**：无论字段值最初来自"粘贴文本+Gemini抽取"还是"CMS PDF上传+多阶段流水线抽取"，医生点击"确认"的那一刻，后端都要把当时展示的富状态结构（`{value, status, confidence, ...}`）**收敛成上面这种扁平格式**再落库到`final_field_values`，供本模块使用。富状态数据只保留在`ai_raw_result`里做审计追溯，不参与填充。

---

## 2. 填充引擎规格

### 2.1 主流程

```python
async def generate_filled_pdf(submission_id: int) -> str:
    submission = await get_submission(submission_id)
    mappings = await get_field_mappings_with_template_field(submission.template_id)
    original_pdf_bytes = await download_from_storage(get_template(submission.template_id).original_pdf_url)
    doc = fitz.open(stream=original_pdf_bytes, filetype="pdf")

    missing_required = []
    for mapping in mappings:
        field = mapping.template_field
        page = doc[field.page_no - 1]
        rect = fitz.Rect(field.pos_x, field.pos_y, field.pos_x + field.width, field.pos_y + field.height)

        value = resolve_value(mapping, submission.final_field_values)
        if value is None:
            if mapping.standard_field and mapping.standard_field.is_required:
                missing_required.append(mapping.standard_field.field_code)
            continue

        if mapping.transform_rule:
            value = apply_transform_rule(value, mapping.transform_rule)

        render_field(page, rect, field.field_type, value, mapping, doctor=submission.doctor)

    if missing_required:
        raise ValidationException(f"必填字段缺失，无法生成: {missing_required}")

    output_bytes = doc.tobytes()
    doc.close()

    output_path = f"generated/{submission.submission_no}.pdf"
    pdf_url = await upload_to_storage(output_bytes, output_path)  # 覆盖式写入，同一submission只保留最新一次
    await update_submission(submission_id, generated_pdf_url=pdf_url)
    return pdf_url


def resolve_value(mapping, final_field_values: dict):
    if mapping.fixed_value is not None:
        return mapping.fixed_value
    if mapping.standard_field is None:
        return None
    return final_field_values.get(mapping.standard_field.field_code)
```

### 2.2 各字段类型的渲染规则

| field_type | 渲染方式 |
|---|---|
| `text` | `fit_text_in_box()`（见2.3），中文用`fontname="china-ts"`（繁体）或`"china-s"`（简体，按诊所语言习惯配置） |
| `date` | 先按`transform_rule`格式化（如`YYYY-MM-DD`→`DD/MM/YYYY`），再按text方式绘制 |
| `checkbox` / `radio` | 判断`value == mapping.checkbox_map_value`，为真则用`draw_check_mark()`（两条交叉线，见下方2.4）绘制勾选标记，为假则不绘制（保持空白） |
| `signature` | 从`doctor.signature_url`下载图片字节，`page.insert_image(rect, stream=image_bytes)` |
| `image` | 从字段值（图片URL）下载后同上插入 |

### 2.3 文本自动缩字号

```python
def fit_text_in_box(page, rect, text, fontname, start_fontsize=10, min_fontsize=6):
    fontsize = start_fontsize
    while fontsize >= min_fontsize:
        if fitz.get_text_length(text, fontname=fontname, fontsize=fontsize) <= rect.width:
            page.insert_text(fitz.Point(rect.x0, rect.y1 - 2), text, fontname=fontname, fontsize=fontsize)
            return
        fontsize -= 0.5
    truncated = truncate_to_width(text, rect.width, min_fontsize, fontname)
    page.insert_text(fitz.Point(rect.x0, rect.y1 - 2), truncated + "…", fontname=fontname, fontsize=min_fontsize)
    logger.warning("field_content_truncated", submission_id=..., text=text)
```

### 2.4 勾选标记（不依赖字体符号）

```python
def draw_check_mark(page, rect):
    page.draw_line(fitz.Point(rect.x0, rect.y0), fitz.Point(rect.x1, rect.y1), color=(0, 0, 0), width=1.2)
    page.draw_line(fitz.Point(rect.x0, rect.y1), fitz.Point(rect.x1, rect.y0), color=(0, 0, 0), width=1.2)
```

### 2.5 异常处理

| 场景 | 处理方式 |
|---|---|
| 必填标准字段值缺失 | 生成前校验，直接抛出异常，返回缺失字段清单，不生成残缺PDF |
| 文本内容超出预留宽度 | 自动缩字号至下限(6pt)，仍超出则截断+记录warning日志，不阻断生成 |
| 签名/印章图片下载失败 | 该处留空，记录warning，不阻断其他字段的填充 |
| 模板原始PDF损坏/无法打开 | 直接失败，返回明确错误，提示联系管理员检查模板 |

---

## 3. API 接口

```
POST /api/doctor/claims/{id}/generate-pdf
Response: { "pdf_url": "https://storage.../generated/SUB20260704001.pdf", "generated_at": "..." }

GET /api/doctor/claims/{id}/pdf
（直接返回PDF文件流，或返回带签名的临时访问URL，供前端iframe加载）
```

---

## 4. 前端：预览与打印

### 4.1 预览——用`<iframe>`嵌入浏览器原生PDF查看器，不用`pdf.js`自绘

```tsx
// app/doctor/claims/new/preview/page.tsx（Step3预览打印页）
"use client";
import { useRef, useState, useEffect } from "react";

export function PdfPreviewPrint({ submissionId }: { submissionId: number }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  useEffect(() => {
    generatePdf(submissionId).then((res) => setPdfUrl(res.pdf_url));
  }, [submissionId]);

  const handlePrint = () => {
    const iframe = iframeRef.current;
    iframe?.contentWindow?.focus();
    iframe?.contentWindow?.print();
  };

  const handleMarkPrinted = async () => {
    await markPrinted(submissionId);
    // 跳转回历史记录或首页工作台
  };

  if (!pdfUrl) return <LoadingState message="正在生成保单..." />;

  return (
    <div className="flex flex-col h-full">
      <iframe ref={iframeRef} src={pdfUrl} className="flex-1 w-full border-0" title="保单预览" />
      <div className="flex gap-2 p-3 border-t">
        <button onClick={() => router.push(`?step=review`)}>返回修改</button>
        <button onClick={handlePrint}>打印</button>
        <a href={pdfUrl} download>下载</a>
        <button onClick={handleMarkPrinted}>确认已打印</button>
      </div>
    </div>
  );
}
```

### 4.2 为什么预览用`iframe`而不是`pdf.js`

| 维度 | `<iframe>`嵌入 | `pdf.js`自绘canvas |
|---|---|---|
| 打印保真度 | 浏览器原生打印PDF，分页/边距/缩放完全按PDF本身 | canvas位图打印，容易出现分页/缩放偏差 |
| 实现复杂度 | 几乎零代码 | 需要自己处理页面渲染、缩放、导航 |
| 适用场景 | 展示"已经定稿"的最终文档 | 需要在PDF上叠加交互（如模板标注工具） |

模板标注工具用`pdf.js`是因为需要交互式叠加字段框，这里只是单纯展示定稿文档，**没有必要引入更复杂的方案**。

### 4.3 打印交互细节

- `iframe.contentWindow.print()`直接调出系统打印对话框，医生可选择打印机、纸张方向等，不需要额外实现
- "标记已打印"由医生手动点击确认——浏览器无法可靠检测"是否真的物理打印成功"，用医生的主动确认作为状态流转依据，这是产品设计上的既有共识，不是技术限制导致的妥协
- "返回修改"按钮允许退回Step2重新核对字段，`status`退回`AI_FILLED`，之前生成的PDF文件会在下次重新生成时被覆盖

---

## 5. 存储路径与版本策略

```
generated/{submission_no}.pdf
```

同一份`claim_submission`每次调用`generate-pdf`都覆盖写入同一路径——业务上只关心"当前最新确认的内容对应哪份PDF"，不需要保留历史每次生成的版本。模板原始PDF（`original_pdf_url`）路径完全独立，加载时用`fitz.open(stream=...)`基于内存字节操作，不做任何原地写入，物理上不可能污染模板文件。
