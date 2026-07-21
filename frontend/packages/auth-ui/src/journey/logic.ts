// Pure journey logic — entry-param parsing, error-to-note mapping, role
// gating, and destination resolution. Kept free of React and network so the
// guard/handoff behaviour is unit-testable in isolation.

import { ApiError } from "@acuity/api-client";
import type { AuthErrorContext, AuthNote } from "./types";

// --- entry params ------------------------------------------------------------
//
// The sign-in page accepts a small, documented query vocabulary:
//   reason=expired|unauthenticated  — why the visitor arrived (expired shows
//                                     the session-expired note; unauthenticated
//                                     is a plain arrival, no note)
//   dl=<token>                      — a single-use deep-link token already
//                                     issued for the return target
//   from=<internal-path>           — a raw internal path to preserve; the
//                                     journey exchanges it for a deep-link
//                                     token server-side (allowlist-validated)
//   demo-account=<login>           — mock-mode prefill identity for password
//                                     sign-in (demo review surface)
//   demo-mfa=fail|expired          — mock-mode one-shot factor outcome
//   demo-scenario=<name>[,...]     — mock scenario names applied at bootstrap
//                                     (slow-network, network-error, ...)

export interface AuthEntryParams {
  reason: "expired" | "unauthenticated" | null;
  deepLinkToken: string | null;
  fromPath: string | null;
  demoAccount: string | null;
  demoMfa: "fail" | "expired" | null;
  demoScenarios: string[];
}

export function parseAuthEntry(searchParams: URLSearchParams): AuthEntryParams {
  const reasonRaw = searchParams.get("reason");
  const reason =
    reasonRaw === "expired" || reasonRaw === "unauthenticated" ? reasonRaw : null;
  const fromRaw = searchParams.get("from");
  const demoMfaRaw = searchParams.get("demo-mfa");
  return {
    reason,
    deepLinkToken: searchParams.get("dl"),
    fromPath: fromRaw && isInternalPath(fromRaw) ? fromRaw : null,
    demoAccount: searchParams.get("demo-account"),
    demoMfa: demoMfaRaw === "fail" || demoMfaRaw === "expired" ? demoMfaRaw : null,
    demoScenarios: searchParams
      .getAll("demo-scenario")
      .flatMap((value) => value.split(","))
      .map((value) => value.trim())
      .filter(Boolean),
  };
}

// Client-side open-redirect floor: only same-origin absolute paths pass. The
// authoritative validation is server-side — the deep-link endpoint rejects
// targets that are not on the return-target allowlist (422).
export function isInternalPath(path: string): boolean {
  return path.startsWith("/") && !path.startsWith("//") && !path.includes("://");
}

// --- error -> note mapping -----------------------------------------------------
//
// Every failure renders inside the card as a calm colour + icon + text note in
// the voice of states — never a raw status code. The catalog key is relative
// to `auth.<surface>.`.

export function resolveErrorNote(
  cause: unknown,
  context: AuthErrorContext,
  surface: "doctor" | "operator",
): AuthNote {
  if (cause instanceof ApiError) {
    if (cause.kind === "network") {
      return { kind: "error", messageKey: "states.networkError" };
    }
    if (cause.kind === "rate_limited") {
      return { kind: "warning", messageKey: "states.locked" };
    }
    if (cause.kind === "forbidden") {
      return { kind: "warning", messageKey: "states.permissionDenied" };
    }
    if (context === "factor" && cause.kind === "validation") {
      return { kind: "error", messageKey: "states.mfaFailed" };
    }
    if (context === "identity" && cause.kind === "unauthorized") {
      return { kind: "error", messageKey: "states.wrongCredentials" };
    }
  }
  switch (context) {
    case "factor":
      return { kind: "error", messageKey: "states.mfaFailed" };
    case "clinic":
      // Operator journeys carry no clinic step; the key exists on doctor only.
      return {
        kind: "error",
        messageKey:
          surface === "doctor" ? "states.clinicSelectFailed" : "states.networkError",
      };
    case "recovery":
      return { kind: "error", messageKey: "states.recoveryFailed" };
    default:
      return { kind: "error", messageKey: "states.wrongCredentials" };
  }
}

// --- role gating ------------------------------------------------------------------
//
// Per-app session isolation: a session whose role this surface does not accept
// is rejected outright (the wrong-app-session state), never let through.

export function roleAllowed(
  role: string | null | undefined,
  allowedRoles: readonly string[],
): boolean {
  if (!role) return false;
  return allowedRoles.includes(role.toUpperCase());
}

// --- destination resolution ----------------------------------------------------
//
// Post-auth handoff: the redeemed deep-link target wins over the surface's
// default landing path; both are app-internal locale-relative paths.

export function resolveDestination(options: {
  redeemedTarget: string | null;
  landingPath: string;
  locale: string;
}): string {
  const target =
    options.redeemedTarget && isInternalPath(options.redeemedTarget)
      ? options.redeemedTarget
      : options.landingPath;
  const path = target.startsWith("/") ? target : `/${target}`;
  return `/${options.locale}${path === "/" ? "" : path}`;
}

// Swap the locale segment of a localized pathname in place (used by the
// in-place language toggle to keep the URL truthful without navigating).
export function swapLocaleInPath(
  pathname: string,
  locales: readonly string[],
  nextLocale: string,
): string {
  const segments = pathname.split("/");
  const first = segments[1];
  if (first && locales.includes(first)) {
    segments[1] = nextLocale;
    return segments.join("/") || `/${nextLocale}`;
  }
  return `/${nextLocale}${pathname === "/" ? "" : pathname}`;
}
