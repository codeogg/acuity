/**
 * 标准目标字段展示顺序，对齐 REQUIREMENTS.zh-CN.md 第一节。
 * 文档中的 `patient_name` 在系统中拆分为中英两个字段。
 */
export const STANDARD_TARGET_FIELD_ORDER = [
  "patient_name_cn",
  "patient_name_en",
  "dob",
  "gender",
  "hkid",
  "patient_phone",
  "insurer_name",
  "policy_number",
  "member_cert_no",
  "clinic_name",
  "doctor_name",
  "visit_date",
  "admission_date",
  "discharge_date",
  "ward_class",
  "diagnosis_text",
  "icd10",
  "procedure_text",
  "cpt",
  "operation_date",
  "amount_total",
  "receipt_no",
] as const;

export function orderFieldCodes(codes: Iterable<string>): string[] {
  const available = new Set(codes);
  const ordered: string[] = [];

  for (const code of STANDARD_TARGET_FIELD_ORDER) {
    if (available.has(code)) {
      ordered.push(code);
      available.delete(code);
    }
  }

  const remaining = [...available].sort((a, b) => a.localeCompare(b));
  return [...ordered, ...remaining];
}
