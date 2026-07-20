import { describe, expect, it } from "vitest";
import { ApiError } from "@acuity/api-client";
import {
  isInternalPath,
  parseAuthEntry,
  resolveDestination,
  resolveErrorNote,
  roleAllowed,
  swapLocaleInPath,
} from "../src/journey/logic";

function apiError(kind: ConstructorParameters<typeof ApiError>[0]["kind"], status = 400) {
  return new ApiError({ kind, status, message: "test" });
}

describe("parseAuthEntry", () => {
  it("parses the documented entry vocabulary", () => {
    const entry = parseAuthEntry(
      new URLSearchParams(
        "reason=expired&dl=dl-1&from=/forms&demo-account=dr.locked&demo-mfa=fail&demo-scenario=slow-network,network-error",
      ),
    );
    expect(entry.reason).toBe("expired");
    expect(entry.deepLinkToken).toBe("dl-1");
    expect(entry.fromPath).toBe("/forms");
    expect(entry.demoAccount).toBe("dr.locked");
    expect(entry.demoMfa).toBe("fail");
    expect(entry.demoScenarios).toEqual(["slow-network", "network-error"]);
  });

  it("drops unknown reasons, external from-paths, and unknown mfa flags", () => {
    const entry = parseAuthEntry(
      new URLSearchParams(
        "reason=welcome&from=https://example.com/x&demo-mfa=maybe",
      ),
    );
    expect(entry.reason).toBeNull();
    expect(entry.fromPath).toBeNull();
    expect(entry.demoMfa).toBeNull();
    expect(entry.demoScenarios).toEqual([]);
  });
});

describe("isInternalPath", () => {
  it("accepts same-origin absolute paths only", () => {
    expect(isInternalPath("/forms")).toBe(true);
    expect(isInternalPath("/forms?claim=12")).toBe(true);
    expect(isInternalPath("//evil.example")).toBe(false);
    expect(isInternalPath("https://evil.example/")).toBe(false);
    expect(isInternalPath("forms")).toBe(false);
    expect(isInternalPath("/x/https://y")).toBe(false);
  });
});

describe("resolveErrorNote", () => {
  it("maps identity failures to the calm state set", () => {
    expect(resolveErrorNote(apiError("unauthorized", 401), "identity", "doctor"))
      .toEqual({ kind: "error", messageKey: "states.wrongCredentials" });
    expect(resolveErrorNote(apiError("rate_limited", 429), "identity", "doctor"))
      .toEqual({ kind: "warning", messageKey: "states.locked" });
    expect(resolveErrorNote(apiError("forbidden", 403), "identity", "doctor"))
      .toEqual({ kind: "warning", messageKey: "states.permissionDenied" });
    expect(resolveErrorNote(apiError("network", 0), "identity", "operator"))
      .toEqual({ kind: "error", messageKey: "states.networkError" });
  });

  it("maps factor, clinic, and recovery failures per step", () => {
    expect(resolveErrorNote(apiError("validation", 422), "factor", "doctor"))
      .toEqual({ kind: "error", messageKey: "states.mfaFailed" });
    expect(resolveErrorNote(apiError("not_found", 404), "clinic", "doctor"))
      .toEqual({ kind: "error", messageKey: "states.clinicSelectFailed" });
    expect(resolveErrorNote(apiError("unknown", 500), "recovery", "operator"))
      .toEqual({ kind: "error", messageKey: "states.recoveryFailed" });
    expect(resolveErrorNote(new Error("boom"), "identity", "doctor"))
      .toEqual({ kind: "error", messageKey: "states.wrongCredentials" });
  });
});

describe("roleAllowed", () => {
  const doctorRoles = ["DOCTOR", "STAFF"] as const;
  const operatorRoles = ["OPERATOR", "SUPER_ADMIN", "SUPPORT", "READ_ONLY"] as const;

  it("gates per-app sessions by role", () => {
    expect(roleAllowed("DOCTOR", doctorRoles)).toBe(true);
    expect(roleAllowed("doctor", doctorRoles)).toBe(true);
    expect(roleAllowed("OPERATOR", doctorRoles)).toBe(false);
    expect(roleAllowed("DOCTOR", operatorRoles)).toBe(false);
    expect(roleAllowed("SUPER_ADMIN", operatorRoles)).toBe(true);
    expect(roleAllowed(null, doctorRoles)).toBe(false);
    expect(roleAllowed(undefined, doctorRoles)).toBe(false);
  });
});

describe("resolveDestination", () => {
  it("prefers the redeemed deep-link target over the landing path", () => {
    expect(
      resolveDestination({
        redeemedTarget: "/forms?claim=12",
        landingPath: "/",
        locale: "en-HK",
      }),
    ).toBe("/en-HK/forms?claim=12");
  });

  it("falls back to the landing path (root collapses to the locale home)", () => {
    expect(
      resolveDestination({ redeemedTarget: null, landingPath: "/", locale: "en-HK" }),
    ).toBe("/en-HK");
    expect(
      resolveDestination({
        redeemedTarget: null,
        landingPath: "/clinics",
        locale: "zh-Hant-HK",
      }),
    ).toBe("/zh-Hant-HK/clinics");
  });

  it("never follows an external redeemed target", () => {
    expect(
      resolveDestination({
        redeemedTarget: "https://evil.example/",
        landingPath: "/clinics",
        locale: "en-HK",
      }),
    ).toBe("/en-HK/clinics");
  });
});

describe("swapLocaleInPath", () => {
  const locales = ["en-HK", "zh-Hant-HK"];
  it("swaps the locale segment in place", () => {
    expect(swapLocaleInPath("/en-HK/sign-in", locales, "zh-Hant-HK")).toBe(
      "/zh-Hant-HK/sign-in",
    );
    expect(swapLocaleInPath("/zh-Hant-HK", locales, "en-HK")).toBe("/en-HK");
  });
  it("prefixes when no locale segment is present", () => {
    expect(swapLocaleInPath("/sign-in", locales, "zh-Hant-HK")).toBe(
      "/zh-Hant-HK/sign-in",
    );
  });
});
