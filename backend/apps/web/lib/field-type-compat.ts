/**
 * 标准字段 data_type 与 PDF 模板 field_type 映射兼容性（非阻断提示）。
 *
 * 标准字段 data_type: text/number/date/boolean/enum/table/image/signature
 * PDF field_type: text/checkbox/radio/date/signature/image
 */
import type { AppLocale } from "@/lib/i18n/types";

const STANDARD_TO_TEMPLATE: Record<string, readonly string[]> = {
  text: ["text"],
  number: ["text"],
  date: ["text", "date"],
  boolean: ["checkbox", "radio"],
  enum: ["text", "checkbox", "radio"],
  image: ["image"],
  signature: ["signature", "image"],
  table: ["text"],
};

const DATA_TYPE_LABEL: Record<string, string> = {
  text: "文本",
  number: "数字",
  date: "日期",
  boolean: "布尔",
  enum: "枚举",
  image: "图片",
  table: "表格",
  signature: "签名",
};

const FIELD_TYPE_LABEL: Record<string, string> = {
  text: "文本",
  checkbox: "勾选框",
  radio: "单选",
  date: "日期",
  signature: "签名",
  image: "图片",
};

const DATA_TYPE_LABEL_EN: Record<string, string> = {
  text: "text",
  number: "number",
  date: "date",
  boolean: "boolean",
  enum: "enum",
  image: "image",
  table: "table",
  signature: "signature",
};

const FIELD_TYPE_LABEL_EN: Record<string, string> = {
  text: "text",
  checkbox: "checkbox",
  radio: "radio button",
  date: "date",
  signature: "signature",
  image: "image",
};

/** 返回类型不匹配警告文案；兼容则返回 null */
export function getMappingTypeWarning(
  templateFieldType: string,
  standardDataType: string,
  locale: AppLocale = "zh-HK",
): string | null {
  const compatible = STANDARD_TO_TEMPLATE[standardDataType];
  if (!compatible) return null;
  if (compatible.includes(templateFieldType)) return null;

  const english = locale === "en-HK";
  const stdLabel = (english ? DATA_TYPE_LABEL_EN : DATA_TYPE_LABEL)[standardDataType]
    ?? standardDataType;
  const tplLabel = (english ? FIELD_TYPE_LABEL_EN : FIELD_TYPE_LABEL)[templateFieldType]
    ?? templateFieldType;
  return english
    ? `Type mismatch: the standard field is “${stdLabel} (${standardDataType})”, while the PDF field is “${tplLabel} (${templateFieldType})”. Confirm the mapping; you may still save if a custom conversion applies.`
    : `類型可能不相符：標準欄位為「${stdLabel}（${standardDataType}）」，PDF 欄位為「${tplLabel}（${templateFieldType}）」。請確認是否選對；如有特殊轉換，可繼續儲存。`;
}
