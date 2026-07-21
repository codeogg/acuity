/** Field display status for the annotate workspace (four-colour dots). */

import type { TemplateFieldOut } from "@acuity/types";

export type FieldDisplayStatus = "mapped" | "pending_confirm" | "ignored" | "unhandled";

export function fieldDisplayStatus(f: TemplateFieldOut): FieldDisplayStatus {
  if (f.field_status === "IGNORED") return "ignored";
  if (f.field_status === "MAPPED") return "mapped";
  if (f.mapping) return "pending_confirm";
  return "unhandled";
}

export function isFieldProcessed(f: TemplateFieldOut): boolean {
  return f.field_status === "MAPPED" || f.field_status === "IGNORED";
}

export const FIELD_STATUS_DOT: Record<FieldDisplayStatus, string> = {
  mapped: "bg-tone-success",
  pending_confirm: "bg-tone-warning",
  ignored: "bg-muted-foreground/50",
  unhandled: "bg-destructive",
};

export const FIELD_STATUS_BORDER: Record<FieldDisplayStatus, string> = {
  mapped: "border-tone-success bg-tone-success/15",
  pending_confirm: "border-tone-warning bg-tone-warning/15",
  ignored: "border-muted-foreground/50 bg-muted/40",
  unhandled: "border-destructive bg-destructive/10",
};
