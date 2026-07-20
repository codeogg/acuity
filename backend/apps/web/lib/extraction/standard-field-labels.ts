import { STANDARD_TARGET_FIELD_ORDER } from "@/lib/extraction/field-order";
import type { AppLocale } from "@/lib/i18n/types";

/** 与 seed.py STANDARD_FIELDS 对齐的展示名称（仅 AI 提取字段） */
export const STANDARD_FIELD_LABELS: Record<string, string> = {
  patient_name_cn: "病人姓名（中文）",
  patient_name_en: "病人姓名（英文）",
  dob: "出生日期",
  gender: "性別",
  hkid: "香港身份證號碼",
  patient_phone: "病人電話",
  insurer_name: "保險公司名稱",
  policy_number: "保單號碼",
  member_cert_no: "會員／憑證號碼",
  clinic_name: "醫院／診所名稱",
  doctor_name: "醫生姓名",
  visit_date: "就診日期",
  admission_date: "入院日期",
  discharge_date: "出院日期",
  ward_class: "病房級別",
  diagnosis_text: "診斷結果",
  icd10: "ICD-10 編碼",
  procedure_text: "手術／處置描述",
  cpt: "CPT 編碼",
  operation_date: "手術日期",
  amount_total: "總金額",
  receipt_no: "收據號碼",
};

const STANDARD_FIELD_LABELS_EN: Record<string, string> = {
  patient_name_cn: "Patient name (Chinese)",
  patient_name_en: "Patient name (English)",
  dob: "Date of birth",
  gender: "Gender",
  hkid: "Hong Kong identity card number",
  patient_phone: "Patient phone",
  insurer_name: "Insurer name",
  policy_number: "Policy number",
  member_cert_no: "Member / certificate number",
  clinic_name: "Hospital / clinic name",
  doctor_name: "Doctor name",
  visit_date: "Visit date",
  admission_date: "Admission date",
  discharge_date: "Discharge date",
  ward_class: "Ward class",
  diagnosis_text: "Diagnosis",
  icd10: "ICD-10 code",
  procedure_text: "Procedure description",
  cpt: "CPT code",
  operation_date: "Operation date",
  amount_total: "Total amount",
  receipt_no: "Receipt number",
};

export function getStandardFieldLabel(code: string, locale: AppLocale): string {
  return (locale === "en-HK" ? STANDARD_FIELD_LABELS_EN : STANDARD_FIELD_LABELS)[code] ?? code;
}

/** 与 seed.py 对齐的必填字段映射 */
export const REQUIRED_FIELDS: Set<string> = new Set([
  "patient_name_cn",
  "diagnosis_text",
]);

export const STANDARD_FIELD_CODES = [...STANDARD_TARGET_FIELD_ORDER] as string[];
