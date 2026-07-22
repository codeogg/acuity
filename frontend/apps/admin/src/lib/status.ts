// Status vocabulary → visual tone + i18n label key. Maps both the backend's
// string-coded enums and the console's operational model (ops-model.ts) onto
// the shared StatusBadge tones. Every status is colour + icon + text label
// (never colour alone — FINAL.md accessibility rule). Labels are i18n keys
// under the `status.*` / `audit.*` namespaces, resolved in both locales.

import type { AcuityIconName } from "@acuity/ui";

export type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "accent";

export type StatusMeta = { tone: Tone; icon: AcuityIconName; key: string };

// clinic / doctor / company `status` SMALLINT (0 disabled, 1 enabled).
export function enabledStatus(status: number): StatusMeta {
  return status === 1
    ? { tone: "success", icon: "check", key: "status.enabled" }
    : { tone: "neutral", icon: "dash", key: "status.disabled" };
}

// clinic operational lifecycle (ops-model, mock-first pending backend fields)
export const CLINIC_OPS_STATUS: Record<string, StatusMeta> = {
  provisioning: { tone: "neutral", icon: "settings", key: "status.provisioning" },
  onboarding: { tone: "info", icon: "arrow-right", key: "status.onboarding" },
  active: { tone: "success", icon: "check", key: "status.active" },
  "needs-attention": { tone: "warning", icon: "alert", key: "status.needs-attention" },
};

export const PAYMENT_STATUS: Record<string, StatusMeta> = {
  paid: { tone: "success", icon: "check", key: "status.paid" },
  unpaid: { tone: "neutral", icon: "dash", key: "status.unpaid" },
  overdue: { tone: "danger", icon: "alert", key: "status.overdue" },
  refunded: { tone: "info", icon: "dash", key: "status.refunded" },
};

export const ACTIVATION_STATUS: Record<string, StatusMeta> = {
  setup: { tone: "neutral", icon: "settings", key: "status.setup" },
  onboarding: { tone: "info", icon: "arrow-right", key: "status.in-onboarding" },
  active: { tone: "success", icon: "check", key: "status.activated" },
};

export const MFA_STATUS: Record<string, StatusMeta> = {
  enrolled: { tone: "success", icon: "check", key: "status.mfa-enrolled" },
  "mfa-pending": { tone: "warning", icon: "clock", key: "status.mfa-pending" },
  "not-enrolled": { tone: "danger", icon: "alert", key: "status.mfa-not-enrolled" },
};

export const SUBSCRIPTION_STATUS: Record<string, StatusMeta> = {
  trial: { tone: "warning", icon: "clock", key: "status.trial" },
  active: { tone: "success", icon: "check", key: "status.subscription-active" },
  cancelled: { tone: "danger", icon: "x", key: "status.cancelled-sub" },
  expired: { tone: "neutral", icon: "dash", key: "status.expired-sub" },
  // Legacy mock labels kept so older badges still resolve.
  paused: { tone: "neutral", icon: "dash", key: "status.expired-sub" },
  churned: { tone: "danger", icon: "x", key: "status.cancelled-sub" },
};

// template lifecycle — the reference's operational statuses, derived from the
// contract's parse_status + is_active (ops-model.templateOpsStatus).
export const TEMPLATE_OPS_STATUS: Record<string, StatusMeta> = {
  uploaded: { tone: "neutral", icon: "upload", key: "status.uploaded" },
  processing: { tone: "info", icon: "clock", key: "status.processing" },
  processed: { tone: "info", icon: "sparkle", key: "status.processed" },
  draft: { tone: "accent", icon: "pencil", key: "status.draft-template" },
  confirmed: { tone: "success", icon: "check", key: "status.confirmed-template" },
  failed: { tone: "danger", icon: "alert", key: "status.failed" },
  archived: { tone: "neutral", icon: "layers", key: "status.archived" },
};

// per-template extraction confidence bands (mock-first, no contract field)
export function confidenceStatus(value: number): StatusMeta & { band: "high" | "medium" | "low" } {
  if (value >= 0.9) return { tone: "success", icon: "check", key: "status.confidence-high", band: "high" };
  if (value >= 0.75) return { tone: "warning", icon: "dot", key: "status.confidence-medium", band: "medium" };
  return { tone: "danger", icon: "alert", key: "status.confidence-low", band: "low" };
}

export const TICKET_STATUS: Record<string, StatusMeta> = {
  open: { tone: "warning", icon: "dot", key: "status.open" },
  "in-progress": { tone: "info", icon: "clock", key: "status.in-progress" },
  resolved: { tone: "success", icon: "check", key: "status.resolved" },
};

// template-field field_status (contract)
export const FIELD_STATUS: Record<string, StatusMeta> = {
  PENDING: { tone: "warning", icon: "clock", key: "status.field-pending" },
  MAPPED: { tone: "success", icon: "check", key: "status.field-mapped" },
  IGNORED: { tone: "neutral", icon: "dash", key: "status.field-ignored" },
};

// claim status machine (contract)
export const CLAIM_STATUS: Record<string, StatusMeta> = {
  DRAFT: { tone: "neutral", icon: "pencil", key: "status.draft" },
  AI_FILLED: { tone: "info", icon: "sparkle", key: "status.ai-filled" },
  CONFIRMED: { tone: "success", icon: "check", key: "status.confirmed" },
  PRINTED: { tone: "accent", icon: "print", key: "status.printed" },
  CANCELLED: { tone: "danger", icon: "x", key: "status.cancelled" },
};

// audit action classes — the full 12-class taxonomy. Unknown codes render the
// raw code on a neutral tone (never mislabelled as another class).
export const AUDIT_ACTION: Record<string, StatusMeta> = {
  "account-created": { tone: "info", icon: "user", key: "audit.account-created" },
  "impersonation-start": { tone: "accent", icon: "eye", key: "audit.impersonation-start" },
  "impersonation-end": { tone: "neutral", icon: "x", key: "audit.impersonation-end" },
  "impersonation-abandoned": { tone: "warning", icon: "alert", key: "audit.impersonation-abandoned" },
  "act-as-edit": { tone: "accent", icon: "pencil", key: "audit.act-as-edit" },
  "retention-override": { tone: "danger", icon: "shield", key: "audit.retention-override" },
  "template-publish": { tone: "success", icon: "check", key: "audit.template-publish" },
  "template-archive": { tone: "neutral", icon: "layers", key: "audit.template-archive" },
  "crm-edit": { tone: "info", icon: "card", key: "audit.crm-edit" },
  "tag-change": { tone: "accent", icon: "tag", key: "audit.tag-change" },
  "bulk-operation": { tone: "neutral", icon: "layers", key: "audit.bulk-operation" },
  export: { tone: "info", icon: "download", key: "audit.export" },
  "phi-reveal": { tone: "danger", icon: "eye", key: "audit.phi-reveal" },
};

// Safe accessors: always return a defined StatusMeta.
const FALLBACK: StatusMeta = { tone: "neutral", icon: "dot", key: "status.pending" };

export const clinicOpsStatus = (code: string): StatusMeta => CLINIC_OPS_STATUS[code] ?? FALLBACK;
export const paymentStatus = (code: string): StatusMeta => PAYMENT_STATUS[code] ?? FALLBACK;
export const activationStatus = (code: string): StatusMeta => ACTIVATION_STATUS[code] ?? FALLBACK;
export const mfaStatus = (code: string): StatusMeta => MFA_STATUS[code] ?? FALLBACK;
export const subscriptionStatus = (code: string): StatusMeta => SUBSCRIPTION_STATUS[code] ?? FALLBACK;
export const templateOpsStatusMeta = (code: string): StatusMeta => TEMPLATE_OPS_STATUS[code] ?? FALLBACK;
export const ticketStatus = (code: string): StatusMeta => TICKET_STATUS[code] ?? FALLBACK;
export const fieldStatus = (code: string): StatusMeta =>
  FIELD_STATUS[code] ?? { tone: "warning", icon: "clock", key: "status.field-pending" };
export const claimStatus = (code: string): StatusMeta =>
  CLAIM_STATUS[code] ?? { tone: "neutral", icon: "pencil", key: "status.draft" };

// Unknown audit action classes surface the raw code (an audit trail must never
// mislabel an event as a different class).
export function auditAction(code: string): StatusMeta | null {
  return AUDIT_ACTION[code] ?? null;
}

export type { AcuityIconName };
