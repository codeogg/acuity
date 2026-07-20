import type { TemplateField } from "@/lib/api/types";

/** 标注页字段展示状态（四色圆点） */
export type FieldDisplayStatus =
  | "mapped"
  | "pending_confirm"
  | "ignored"
  | "unhandled";

export function fieldDisplayStatus(f: TemplateField): FieldDisplayStatus {
  if (f.field_status === "IGNORED") return "ignored";
  if (f.field_status === "MAPPED") return "mapped";
  // PENDING
  if (f.mapping) return "pending_confirm";
  return "unhandled";
}

export const FIELD_STATUS_DOT: Record<FieldDisplayStatus, string> = {
  mapped: "bg-green-500",
  pending_confirm: "bg-amber-500",
  ignored: "bg-gray-400",
  unhandled: "bg-red-500",
};

export const FIELD_STATUS_BORDER: Record<FieldDisplayStatus, string> = {
  mapped: "border-green-500 bg-green-500/15",
  pending_confirm: "border-amber-500 bg-amber-500/15",
  ignored: "border-gray-400 bg-gray-400/15",
  unhandled: "border-red-500 bg-red-500/15",
};

export function isFieldProcessed(f: TemplateField): boolean {
  return f.field_status === "MAPPED" || f.field_status === "IGNORED";
}

export const FIELD_STATUS_LABEL: Record<FieldDisplayStatus, string> = {
  mapped: "已映射",
  pending_confirm: "待确认",
  ignored: "已忽略",
  unhandled: "待处理",
};
