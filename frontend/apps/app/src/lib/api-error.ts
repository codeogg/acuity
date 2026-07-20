"use client";

import { useTranslations } from "next-intl";
import { ApiError } from "@acuity/api-client";

// Localised presentation for typed API failures. The mock (and real) backend's
// error-envelope messages can be Chinese; the UI never renders `error.message`
// raw — every kind maps to catalogued copy in the active locale (matrix 8.2 /
// 9.12). Keys live under "errors" in both catalogs.

export type ApiErrorKey =
  | "errors.network"
  | "errors.server"
  | "errors.not-found"
  | "errors.conflict"
  | "errors.validation"
  | "errors.session-expired"
  | "errors.forbidden"
  | "errors.rate-limited"
  | "errors.ai-unavailable"
  | "errors.unknown";

export function apiErrorKey(error: ApiError | undefined): ApiErrorKey {
  switch (error?.kind) {
    case "network":
      return "errors.network";
    case "not_found":
      return "errors.not-found";
    case "conflict":
      return "errors.conflict";
    case "validation":
      return "errors.validation";
    case "unauthorized":
      return "errors.session-expired";
    case "forbidden":
      return "errors.forbidden";
    case "rate_limited":
      return "errors.rate-limited";
    case "ai_unavailable":
      return "errors.ai-unavailable";
    case "unknown":
      return error.status >= 500 ? "errors.server" : "errors.unknown";
    default:
      return "errors.unknown";
  }
}

/** A translator for API errors: `const apiMessage = useApiErrorMessage()`. */
export function useApiErrorMessage(): (error: ApiError | undefined) => string {
  const t = useTranslations();
  return (error) => t(apiErrorKey(error));
}

/** Broadcast a session-expiry so the overlay layer can surface re-auth. */
export function notifySessionExpired(error: unknown): void {
  if (
    typeof window !== "undefined" &&
    error instanceof ApiError &&
    error.kind === "unauthorized"
  ) {
    window.dispatchEvent(new CustomEvent("acuity:session-expired"));
  }
}
