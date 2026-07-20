// Doctor-facing review field-schema model.
//
// The backend's ClaimOut carries `final_field_values` (a flat field_code ->
// value map) and `ai_raw_result` (field_code -> {value, confidence}). The
// review surface renders fields grouped by the insurer form's own CATEGORY in
// stored ORDER, each field carrying a bilingual label, a data type, a required
// marker, the four-status model (Optional / Needs input / Drafted / Confirmed),
// optional render-shape metadata (comb cells, checkbox rows) for the form
// facsimile, and optional validation rules. The backend models category + order
// as per-field attributes of the template field-map; mock-first the per-template
// schema ships in the fixture universe. When the real backend lands this is
// replaced by a schema the API returns — the review UI consumes this shape
// either way.

import type { ClaimStatus } from "@acuity/types";
import universe from "./universe.json";

export type FieldDataType = "text" | "date" | "number" | "enum" | "signature";

export interface FieldCategory {
  code: string;
  label_en: string;
  label_zh: string;
  order: number;
}

// Render-shape metadata for the insurer-form facsimile (comb cells, checkbox
// rows, signature lines).
export interface FieldRenderMeta {
  shape: "line" | "box" | "comb" | "checkbox-row";
  comb_length?: number;
  options?: string[];
}

// Inline validation metadata (bilingual message adjacent to the field).
export interface FieldValidationMeta {
  rule: string;
  message_en: string;
  message_zh: string;
}

export interface FieldSchemaEntry {
  field_code: string;
  category_code: string;
  order: number;
  label_en: string;
  label_zh: string;
  data_type: FieldDataType;
  required: boolean;
  enum_options?: string[];
  // The span of the doctor's uploaded record this value was drafted from
  // (the "where from" evidence). Null for fields with no located source.
  source_span?: string | null;
  render?: FieldRenderMeta;
  validation?: FieldValidationMeta;
}

export interface TemplateFieldSchema {
  template_id: number;
  categories: FieldCategory[];
  fields: FieldSchemaEntry[];
}

// The four doctor-facing field statuses (the functional field-state model).
export type FieldStatus = "optional" | "needs-input" | "drafted" | "confirmed";

const schemas = universe.field_schemas as unknown as Record<string, TemplateFieldSchema>;

export function getTemplateFieldSchema(templateId: number): TemplateFieldSchema {
  const fallback = schemas["101"] as TemplateFieldSchema;
  return schemas[String(templateId)] ?? fallback;
}

// Derive a field's four-status from its value + confirmation set + required-ness.
export function deriveFieldStatus(
  field: FieldSchemaEntry,
  value: string | null | undefined,
  confirmed: boolean,
): FieldStatus {
  if (confirmed) return "confirmed";
  const hasValue = value !== null && value !== undefined && value !== "";
  if (hasValue) return "drafted";
  return field.required ? "needs-input" : "optional";
}

// Statuses that block sign-off: a required field that is not confirmed, or any
// field with a value that is not yet confirmed (Drafted). Optional-blank does
// not block.
export function blocksSignOff(status: FieldStatus): boolean {
  return status === "needs-input" || status === "drafted";
}

// Whether a claim's status places it inside the review-and-sign stage.
export function isReviewable(status: ClaimStatus): boolean {
  return status === "AI_FILLED" || status === "DRAFT" || status === "CONFIRMED";
}
