// Deep-link + session-expiry seam over the real mock backend (MSW node
// server + the stateful auth store): issue -> redeem -> single-use, the
// allowlist rejection, and the session refresh journey the guard relies on.

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { frontendOnly, ApiError, auth } from "@acuity/api-client";
import { server } from "@acuity/api-client/mocks/server";
import { resetMockScenario } from "@acuity/api-client/mocks/scenario";
import { authStore } from "@acuity/api-client/mocks/stores";

const { authFlow } = frontendOnly;

// Give MSW's relative "/api/*" handlers a location to resolve against, and
// the api client an absolute base so Node fetch resolves; MSW intercepts
// before the network.
Object.defineProperty(globalThis, "location", {
  value: new URL("http://acuity.test/"),
  writable: true,
  configurable: true,
});
process.env.NEXT_PUBLIC_API_BASE = "http://acuity.test/api";

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  resetMockScenario();
  authStore.resetAuthStore();
});
afterAll(() => server.close());

describe("deep-link tokens (single-use, allowlist-validated)", () => {
  it("issues and redeems a token once; the second redeem is invalid", async () => {
    const issued = await authFlow.issueDeepLinkToken({ return_target: "/forms" });
    expect(issued.token).toBeTruthy();
    const first = await authFlow.redeemDeepLinkToken({ token: issued.token });
    expect(first).toEqual({ valid: true, return_target: "/forms" });
    const second = await authFlow.redeemDeepLinkToken({ token: issued.token });
    expect(second).toEqual({ valid: false, return_target: null });
  });

  it("rejects a return target that is not on the allowlist (422)", async () => {
    // Absolute URLs and non-rooted paths never match the allowlist. (Rooted
    // internal paths all pass because the mock allowlist carries the "/"
    // prefix — a store-level looseness owned by the data layer; the client
    // side additionally floors targets through isInternalPath.)
    await expect(
      authFlow.issueDeepLinkToken({ return_target: "https://evil.example/" }),
    ).rejects.toMatchObject({ kind: "validation" });
    await expect(
      authFlow.issueDeepLinkToken({ return_target: "forms" }),
    ).rejects.toMatchObject({ kind: "validation" });
  });
});

describe("auth journey over the stateful mock store", () => {
  it("walks login -> MFA -> clinic selection for a multi-clinic doctor", async () => {
    const login = await auth.login({
      username: "dr2207",
      password: "acuity-demo",
    } as never);
    expect(login.role).toBe("DOCTOR");
    const challenge = await authFlow.beginMfaChallenge();
    expect(challenge.methods).toContain("totp");
    await expect(
      authFlow.verifyMfa({
        challenge_id: challenge.challenge_id,
        method: "totp",
        code: "000000",
      }),
    ).rejects.toMatchObject({ kind: "validation" });
    const ok = await authFlow.verifyMfa({
      challenge_id: challenge.challenge_id,
      method: "totp",
      code: "246810",
    });
    expect(ok.success).toBe(true);
    const clinics = await authFlow.listAccountClinics();
    expect(clinics.items.length).toBeGreaterThan(1);
    const first = clinics.items[0];
    expect(first).toBeDefined();
    const selected = await authFlow.selectClinic({ clinic_id: first!.id });
    expect(selected.success).toBe(true);
  });

  it("surfaces the locked account as rate_limited (the locked state)", async () => {
    await expect(
      auth.login({ username: "dr.locked", password: "acuity-demo" } as never),
    ).rejects.toMatchObject({ kind: "rate_limited" });
  });

  it("surfaces wrong credentials as unauthorized", async () => {
    await expect(
      auth.login({ username: "nobody", password: "" } as never),
    ).rejects.toMatchObject({ kind: "unauthorized" });
  });

  it("session refresh revives an expired session (re-entry seam)", async () => {
    authStore.expireSession();
    const expired = await authFlow.getSession();
    expect(expired.authenticated).toBe(false);
    const refreshed = await authFlow.refreshSession();
    expect(refreshed.authenticated).toBe(true);
  });
});

describe("ApiError shape", () => {
  it("keeps the typed kind for the journey's note mapping", async () => {
    try {
      await auth.login({ username: "nobody", password: "" } as never);
      expect.unreachable();
    } catch (cause) {
      expect(cause).toBeInstanceOf(ApiError);
      expect((cause as ApiError).status).toBe(401);
    }
  });
});
