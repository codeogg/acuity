/** Standard-field groups aligned with backend seed domains. */

export interface FieldGroup {
  domainCode: string;
  domainName: string;
  domainNameEn: string;
  sortOrder: number;
  fieldCodes: readonly string[];
}

export const TEMPLATE_SPECIFIC_GROUP: Omit<FieldGroup, "fieldCodes"> = {
  domainCode: "TEMPLATE_SPECIFIC",
  domainName: "範本專屬 AI 提取",
  domainNameEn: "Template-specific AI fields",
  sortOrder: 9,
};

export const FIELD_GROUPS: FieldGroup[] = [
  {
    domainCode: "PATIENT",
    domainName: "病人資料",
    domainNameEn: "Patient information",
    sortOrder: 1,
    fieldCodes: ["patient_name_cn", "patient_name_en", "dob", "gender", "hkid", "patient_phone"],
  },
  {
    domainCode: "INSURANCE",
    domainName: "保險資料",
    domainNameEn: "Insurance information",
    sortOrder: 2,
    fieldCodes: ["insurer_name", "policy_number", "member_cert_no"],
  },
  {
    domainCode: "CLINIC",
    domainName: "機構資料",
    domainNameEn: "Provider information",
    sortOrder: 3,
    fieldCodes: ["clinic_name"],
  },
  {
    domainCode: "DOCTOR",
    domainName: "醫生資料",
    domainNameEn: "Doctor information",
    sortOrder: 4,
    fieldCodes: ["doctor_name"],
  },
  {
    domainCode: "HOSPITALIZATION",
    domainName: "住院資料",
    domainNameEn: "Hospitalisation",
    sortOrder: 5,
    fieldCodes: ["admission_date", "discharge_date", "ward_class", "operation_date"],
  },
  {
    domainCode: "DIAGNOSIS",
    domainName: "診斷資料",
    domainNameEn: "Diagnosis",
    sortOrder: 6,
    fieldCodes: ["visit_date", "diagnosis_text", "icd10"],
  },
  {
    domainCode: "PROCEDURE",
    domainName: "手術／處置",
    domainNameEn: "Procedures",
    sortOrder: 7,
    fieldCodes: ["procedure_text", "cpt"],
  },
  {
    domainCode: "FEE",
    domainName: "費用資料",
    domainNameEn: "Fees",
    sortOrder: 8,
    fieldCodes: ["amount_total", "receipt_no"],
  },
];

export function getFieldGroupName(group: Pick<FieldGroup, "domainCode" | "domainName" | "domainNameEn">, locale: string): string {
  return locale.startsWith("zh") ? group.domainName : group.domainNameEn;
}

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
  return [...ordered, ...[...available].sort((a, b) => a.localeCompare(b))];
}

export const STANDARD_FIELD_LABELS: Record<string, { zh: string; en: string }> = {
  patient_name_cn: { zh: "病人姓名（中文）", en: "Patient name (Chinese)" },
  patient_name_en: { zh: "病人姓名（英文）", en: "Patient name (English)" },
  dob: { zh: "出生日期", en: "Date of birth" },
  gender: { zh: "性別", en: "Gender" },
  hkid: { zh: "香港身份證號碼", en: "Hong Kong identity card number" },
  patient_phone: { zh: "病人電話", en: "Patient phone" },
  insurer_name: { zh: "保險公司名稱", en: "Insurer name" },
  policy_number: { zh: "保單號碼", en: "Policy number" },
  member_cert_no: { zh: "會員／憑證號碼", en: "Member / certificate number" },
  clinic_name: { zh: "醫院／診所名稱", en: "Hospital / clinic name" },
  doctor_name: { zh: "醫生姓名", en: "Doctor name" },
  visit_date: { zh: "就診日期", en: "Visit date" },
  admission_date: { zh: "入院日期", en: "Admission date" },
  discharge_date: { zh: "出院日期", en: "Discharge date" },
  ward_class: { zh: "病房級別", en: "Ward class" },
  diagnosis_text: { zh: "診斷結果", en: "Diagnosis" },
  icd10: { zh: "ICD-10 編碼", en: "ICD-10 code" },
  procedure_text: { zh: "手術／處置描述", en: "Procedure description" },
  cpt: { zh: "CPT 編碼", en: "CPT code" },
  operation_date: { zh: "手術日期", en: "Operation date" },
  amount_total: { zh: "總金額", en: "Total amount" },
  receipt_no: { zh: "收據號碼", en: "Receipt number" },
};

export const REQUIRED_FIELDS = new Set([
  "patient_name_cn",
  "visit_date",
  "diagnosis_text",
]);

export function getStandardFieldLabel(code: string, locale: string): string {
  const hit = STANDARD_FIELD_LABELS[code];
  if (!hit) return code;
  return locale.startsWith("zh") ? hit.zh : hit.en;
}
