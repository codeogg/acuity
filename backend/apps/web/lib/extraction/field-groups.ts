/**
 * 标准字段的分组定义（信息域），对齐 seed.py DOMAINS + STANDARD_FIELDS。
 *
 * 用于「标准字段核对」面板按分类分组展示字段，方便医生快速定位。
 */
import type { AppLocale } from "@/lib/i18n/types";

export interface FieldGroup {
  domainCode: string;
  domainName: string;
  sortOrder: number;
  fieldCodes: readonly string[];
}

/** 模板专属 AI 提取字段分组（动态 codes，由模板映射决定） */
export const TEMPLATE_SPECIFIC_GROUP: Omit<FieldGroup, "fieldCodes"> = {
  domainCode: "TEMPLATE_SPECIFIC",
  domainName: "範本專屬 AI 提取",
  sortOrder: 9,
};

export const FIELD_GROUPS: FieldGroup[] = [
  {
    domainCode: "PATIENT",
    domainName: "病人資料",
    sortOrder: 1,
    fieldCodes: [
      "patient_name_cn",
      "patient_name_en",
      "dob",
      "gender",
      "hkid",
      "patient_phone",
    ],
  },
  {
    domainCode: "INSURANCE",
    domainName: "保險資料",
    sortOrder: 2,
    fieldCodes: [
      "insurer_name",
      "policy_number",
      "member_cert_no",
    ],
  },
  {
    domainCode: "CLINIC",
    domainName: "機構資料",
    sortOrder: 3,
    fieldCodes: [
      "clinic_name",
    ],
  },
  {
    domainCode: "DOCTOR",
    domainName: "醫生資料",
    sortOrder: 4,
    fieldCodes: [
      "doctor_name",
    ],
  },
  {
    domainCode: "HOSPITALIZATION",
    domainName: "住院資料",
    sortOrder: 5,
    fieldCodes: [
      "admission_date",
      "discharge_date",
      "ward_class",
      "operation_date",
    ],
  },
  {
    domainCode: "DIAGNOSIS",
    domainName: "診斷資料",
    sortOrder: 6,
    fieldCodes: [
      "visit_date",
      "diagnosis_text",
      "icd10",
    ],
  },
  {
    domainCode: "PROCEDURE",
    domainName: "手術／處置",
    sortOrder: 7,
    fieldCodes: [
      "procedure_text",
      "cpt",
    ],
  },
  {
    domainCode: "FEE",
    domainName: "費用資料",
    sortOrder: 8,
    fieldCodes: [
      "amount_total",
      "receipt_no",
    ],
  },
];

const GROUP_NAMES_EN: Record<string, string> = {
  TEMPLATE_SPECIFIC: "Template-specific AI fields",
  PATIENT: "Patient information",
  INSURANCE: "Insurance information",
  CLINIC: "Provider information",
  DOCTOR: "Doctor information",
  HOSPITALIZATION: "Hospitalisation",
  DIAGNOSIS: "Diagnosis",
  PROCEDURE: "Procedures",
  FEE: "Fees",
  _other: "Other fields",
};

export function getFieldGroupName(group: Pick<FieldGroup, "domainCode" | "domainName">, locale: AppLocale): string {
  return locale === "en-HK" ? GROUP_NAMES_EN[group.domainCode] ?? group.domainName : group.domainName;
}

/** 字段 code → 所属分组信息（查找表） */
export const FIELD_GROUP_MAP: Record<string, FieldGroup> = {};
for (const group of FIELD_GROUPS) {
  for (const code of group.fieldCodes) {
    FIELD_GROUP_MAP[code] = group;
  }
}

/**
 * 将字段按分组排列，返回 `[{ group, codes[] }, ...]`。
 * 只包含在 `availableFields` 中存在的字段，且跳过空分组。
 */
export function groupFieldsByDomain(
  availableFields: Set<string> | string[],
): { group: FieldGroup; codes: string[] }[] {
  const available = Array.isArray(availableFields) 
    ? new Set(availableFields) 
    : availableFields;
  
  const result: { group: FieldGroup; codes: string[] }[] = [];

  for (const group of FIELD_GROUPS) {
    const codes = group.fieldCodes.filter((c) => available.has(c));
    if (codes.length > 0) {
      result.push({ group, codes });
    }
  }

  return result;
}
