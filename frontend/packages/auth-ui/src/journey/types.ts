// Shared journey vocabulary. The screen set is the finalised-shell flow
// (identity -> factor -> optional clinic -> landed) plus the recovery /
// permission branches and the shared LD8 loading screen.

export type AuthSurfaceKind = "doctor" | "operator";

export type AuthScreen =
  | "identity"
  | "factor"
  | "clinic"
  | "loading"
  | "landed"
  | "recovery"
  | "permission";

// An inline state note (colour + icon + text, per hard rule 5). The message is
// carried as a catalog key under `auth.<surface>.` and resolved at render, so
// the flow logic stays translation-free and the in-place language toggle
// re-resolves every visible string.
export type AuthNoteKind = "error" | "warning" | "info" | "success";

export interface AuthNote {
  kind: AuthNoteKind;
  messageKey: string;
}

export interface ClinicOption {
  id: number;
  clinicCode: string;
  nameEn: string;
  nameZh: string;
}

// Which step an error occurred on — drives the calm, step-appropriate note.
export type AuthErrorContext = "identity" | "factor" | "clinic" | "recovery";
