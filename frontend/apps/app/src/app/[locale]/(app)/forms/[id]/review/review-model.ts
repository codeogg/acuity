// The review surface's derived field model. Builds the category-grouped,
// ordered field list (per ADR 0034: category + order are stored, the review
// renders deterministically from them) from the template schema + the claim's
// current values + the local confirmation set, and evaluates the inline
// validation layer (field-adjacent, non-blocking messages — review.md P5).

import type { ClaimOut } from "@acuity/types";
import {
  deriveFieldStatus,
  getTemplateFieldSchema,
  type FieldCategory,
  type FieldSchemaEntry,
  type FieldStatus,
} from "@acuity/api-client/mocks/fixtures";

export interface FieldProblem {
  message_en: string;
  message_zh: string;
  /** Blocking problems disable confirm; advisory ones only inform. */
  blocking: boolean;
}

export interface ReviewField extends FieldSchemaEntry {
  value: string;
  confirmed: boolean;
  status: FieldStatus;
  autofilled: boolean;
  /** A format/consistency problem with the current value (null = valid). */
  problem: FieldProblem | null;
}

export interface ReviewGroup {
  category: FieldCategory;
  fields: ReviewField[];
}

export interface ReviewModel {
  groups: ReviewGroup[];
  counts: {
    optional: number;
    needsInput: number;
    drafted: number;
    confirmed: number;
  };
  // Fields that block sign-off (Needs input + Drafted).
  blockingCount: number;
  /** The first field needing input, in stored order (auto-focus target). */
  firstNeedsInput: string | null;
}

// --- inline validation rules -------------------------------------------------
// Named rules ship in the field schema (validation.rule + bilingual message);
// the comb-overflow check derives from the render metadata. Messages render
// adjacent to the field and never block editing.

const HKID_RE = /^[A-Z]{1,2}[0-9]{6}\([0-9A]\)$/;
const ICD10_RE = /^[A-Z][0-9]{2}(?:\.[0-9A-Z]{1,4})?$/;

function evaluateProblem(
  field: FieldSchemaEntry,
  value: string,
  values: Record<string, string>,
): FieldProblem | null {
  if (value === "") return null;

  // Comb overflow (advisory): more characters than the paper form's boxes
  // once punctuation is dropped, exactly as the comb prints them.
  if (field.render?.shape === "comb" && field.render.comb_length) {
    const chars = value.replace(/[^0-9A-Za-z]/g, "");
    if (chars.length > field.render.comb_length) {
      return {
        message_en: `Longer than the form's ${field.render.comb_length} boxes — extra characters won't print.`,
        message_zh: `超出表格的 ${field.render.comb_length} 格——多出的字元不會列印。`,
        blocking: false,
      };
    }
  }

  const rule = field.validation;
  if (!rule) return null;
  const problem: FieldProblem = {
    message_en: rule.message_en,
    message_zh: rule.message_zh,
    blocking: true,
  };

  switch (rule.rule) {
    case "hkid":
      return HKID_RE.test(value.trim().toUpperCase()) ? null : problem;
    case "icd10":
      return ICD10_RE.test(value.trim().toUpperCase()) ? null : problem;
    case "amount": {
      // Total must equal consultation + medication fees (when all present).
      const total = Number(value);
      const consultation = Number(values["consultation_fee"] ?? "");
      const medication = Number(values["medication_fee"] ?? "0");
      if (Number.isNaN(total)) return problem;
      if (Number.isNaN(consultation)) return null;
      return Math.abs(total - (consultation + (Number.isNaN(medication) ? 0 : medication))) <
        0.005
        ? null
        : problem;
    }
    default:
      return null;
  }
}

export function buildReviewModel(
  claim: ClaimOut,
  confirmed: Record<string, boolean>,
): ReviewModel {
  const schema = getTemplateFieldSchema(claim.template_id);
  const values = (claim.final_field_values ?? {}) as Record<string, string>;
  const aiRaw = (claim.ai_raw_result ?? {}) as Record<
    string,
    { value?: string | null } | undefined
  >;

  const fields: ReviewField[] = schema.fields.map((entry) => {
    const value = values[entry.field_code] ?? "";
    const isConfirmed = confirmed[entry.field_code] ?? false;
    const autofilled = aiRaw[entry.field_code]?.value != null && value !== "";
    return {
      ...entry,
      value,
      confirmed: isConfirmed,
      autofilled,
      status: deriveFieldStatus(entry, value, isConfirmed),
      problem: evaluateProblem(entry, value, values),
    };
  });

  const counts = { optional: 0, needsInput: 0, drafted: 0, confirmed: 0 };
  for (const f of fields) {
    if (f.status === "optional") counts.optional += 1;
    else if (f.status === "needs-input") counts.needsInput += 1;
    else if (f.status === "drafted") counts.drafted += 1;
    else counts.confirmed += 1;
  }

  const groups: ReviewGroup[] = schema.categories
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((category) => ({
      category,
      fields: fields
        .filter((f) => f.category_code === category.code)
        .sort((a, b) => a.order - b.order),
    }))
    .filter((g) => g.fields.length > 0);

  const blockingCount = counts.needsInput + counts.drafted;

  let firstNeedsInput: string | null = null;
  outer: for (const group of groups) {
    for (const f of group.fields) {
      if (f.status === "needs-input") {
        firstNeedsInput = f.field_code;
        break outer;
      }
    }
  }

  return { groups, counts, blockingCount, firstNeedsInput };
}
