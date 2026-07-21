import { describe, expect, it } from "vitest";
import {
  authGateDecision,
  readAccessTokenRole,
  rolePermittedForGate,
  splitLocalePath,
} from "../src/mount/gate";

const config = { signInPath: "/sign-in", publicPaths: ["/"] as const };

describe("splitLocalePath", () => {
  it("splits locale-prefixed and bare paths", () => {
    expect(splitLocalePath("/en-HK/forms")).toEqual({
      locale: "en-HK",
      rest: "/forms",
    });
    expect(splitLocalePath("/zh-Hant-HK")).toEqual({
      locale: "zh-Hant-HK",
      rest: "/",
    });
    expect(splitLocalePath("/forms")).toEqual({ locale: "en-HK", rest: "/forms" });
    expect(splitLocalePath("/")).toEqual({ locale: "en-HK", rest: "/" });
  });
});

describe("authGateDecision", () => {
  it("allows sessions through", () => {
    expect(authGateDecision("/en-HK/forms", true, config)).toEqual({
      action: "allow",
    });
  });

  it("allows the sign-in page and declared public paths without a session", () => {
    expect(authGateDecision("/en-HK/sign-in", false, config)).toEqual({
      action: "allow",
    });
    expect(authGateDecision("/en-HK", false, config)).toEqual({ action: "allow" });
    expect(authGateDecision("/", false, config)).toEqual({ action: "allow" });
  });

  it("redirects protected paths to sign-in preserving the internal path", () => {
    expect(authGateDecision("/en-HK/forms", false, config)).toEqual({
      action: "redirect",
      to: "/en-HK/sign-in?reason=unauthenticated&from=%2Fforms",
    });
    expect(authGateDecision("/zh-Hant-HK/clinics", false, config)).toEqual({
      action: "redirect",
      to: "/zh-Hant-HK/sign-in?reason=unauthenticated&from=%2Fclinics",
    });
  });

  it("a root '/' public prefix does not open every path", () => {
    expect(authGateDecision("/en-HK/forms/12", false, config).action).toBe(
      "redirect",
    );
  });

  it("nested public prefixes match by segment, not substring", () => {
    const cfg = { signInPath: "/sign-in", publicPaths: ["/help"] as const };
    expect(authGateDecision("/en-HK/help/faq", false, cfg)).toEqual({
      action: "allow",
    });
    expect(authGateDecision("/en-HK/helpers", false, cfg).action).toBe("redirect");
  });
});

describe("rolePermittedForGate", () => {
  it("allows any role when the allow-list is empty", () => {
    expect(rolePermittedForGate("DOCTOR", undefined)).toBe(true);
    expect(rolePermittedForGate("DOCTOR", [])).toBe(true);
  });

  it("rejects missing roles and roles outside the allow-list", () => {
    expect(rolePermittedForGate(null, ["OPERATOR"])).toBe(false);
    expect(rolePermittedForGate("DOCTOR", ["OPERATOR", "SUPER_ADMIN"])).toBe(false);
    expect(rolePermittedForGate("operator", ["OPERATOR"])).toBe(true);
  });
});

describe("readAccessTokenRole", () => {
  it("reads the role claim from a JWT payload segment", () => {
    const payload = Buffer.from(
      JSON.stringify({ sub: "1", role: "DOCTOR" }),
      "utf8",
    ).toString("base64url");
    expect(readAccessTokenRole(`x.${payload}.y`)).toBe("DOCTOR");
    expect(readAccessTokenRole("not-a-jwt")).toBeNull();
  });
});
