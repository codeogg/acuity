// Auth handlers — the real contract trio (login / me / logout, httpOnly cookie
// mirror) with deterministic failure paths, plus the FRONTEND-ONLY folded-auth
// journey (MFA challenge/verify, account discovery + clinic selection,
// recovery, session state/refresh, deep-link tokens). See the package README
// for the demo account roster and codes.

import { HttpResponse, http } from "msw";
import type { LoginRequest, LoginResponse, MeResponse } from "@acuity/types";
import { demoUser, operatorUser } from "../fixtures/universe";
import * as authStore from "../stores/auth-store";
import { API, errorEnvelope, gate } from "./shared";

function loginResponseFor(session: authStore.MockSession): LoginResponse {
  return {
    access_token: "mock-jwt-token",
    token_type: "bearer",
    role: session.account.role,
    user_id: session.account.user_id,
    clinic_id: session.clinicId,
    display_name: session.account.display_name,
    // AccountSessionExtension (ADR 0040/0041): the doctor's MFA opt-in gates
    // the step-up, the merged marker spans every linked clinic.
    mfa_enabled: session.mfaEnabled,
    merged_workspace: authStore.isMergedWorkspace(session),
  } as LoginResponse;
}

function sessionCookieHeader(role: string, clear = false): string {
  const isAdmin = role !== "DOCTOR" && role !== "STAFF";
  const name = isAdmin ? "admin_access_token" : "doctor_access_token";
  if (clear) {
    return `${name}=; HttpOnly; Path=/; Max-Age=0`;
  }
  return `${name}=mock-jwt-token; HttpOnly; Path=/; SameSite=Lax`;
}

export const authHandlers = [
  // --- real contract ops ----------------------------------------------------
  http.post(`${API}/auth/login`, async ({ request }) => {
    const { deny } = await gate(request, { authed: false });
    if (deny) return deny;
    const body = (await request.json()) as LoginRequest;
    const outcome = authStore.login(body.username, body.password);
    if (!outcome.ok) {
      if (outcome.reason === "locked") {
        return errorEnvelope(
          "RATE_LIMITED",
          "帳戶已被暫時鎖定，請稍後再試或聯絡診所管理員。",
          429,
        );
      }
      return errorEnvelope("UNAUTHORIZED", "帳戶或密碼不正確。", 401);
    }
    const payload = loginResponseFor(outcome.session);
    return HttpResponse.json(payload, {
      headers: {
        "Set-Cookie": sessionCookieHeader(payload.role),
      },
    });
  }),

  http.post(`${API}/auth/logout`, async ({ request }) => {
    const { deny } = await gate(request, { authed: false });
    if (deny) return deny;
    authStore.logout();
    const surface = (request.headers.get("X-Acuity-Surface") || "doctor").toLowerCase();
    const role = surface === "admin" ? "OPERATOR" : "DOCTOR";
    return HttpResponse.json(
      { success: true },
      { headers: { "Set-Cookie": sessionCookieHeader(role, true) } },
    );
  }),

  http.get(`${API}/auth/me`, async ({ request }) => {
    const { scenario, deny } = await gate(request);
    if (deny) return deny;
    const session = authStore.currentSession();
    if (session?.expired) {
      return errorEnvelope("UNAUTHORIZED", "登入已過期，請重新登入。", 401);
    }
    if (scenario.role === "operator") {
      return HttpResponse.json({
        ...operatorUser,
        username: (operatorUser as { username?: string }).username ?? "operator",
      });
    }
    if (!session) {
      return HttpResponse.json({
        ...demoUser,
        username: (demoUser as { username?: string }).username ?? "doctor",
      });
    }
    const me: MeResponse = {
      user_id: session.account.user_id,
      role: session.account.role,
      clinic_id: session.clinicId,
      display_name: session.account.display_name,
      username: session.account.login_account,
      // AccountSessionExtension: the app shell renders the combined-workspace
      // label off this marker (ADR 0041 §6).
      merged_workspace: authStore.isMergedWorkspace(session),
    } as MeResponse;
    return HttpResponse.json(me);
  }),

  http.patch(`${API}/auth/me`, async ({ request }) => {
    const { deny } = await gate(request);
    if (deny) return deny;
    const body = (await request.json()) as { display_name?: string | null };
    const name = (body.display_name ?? "").trim();
    if (!name) {
      return errorEnvelope("VALIDATION_ERROR", "顯示名稱不能為空。", 422);
    }
    const session = authStore.currentSession();
    if (session) {
      session.account.display_name = name;
    }
    const base =
      session == null
        ? { ...(operatorUser as MeResponse), username: "mcheng" }
        : ({
            user_id: session.account.user_id,
            role: session.account.role,
            clinic_id: session.clinicId,
            display_name: name,
            username: session.account.login_account,
          } as MeResponse);
    return HttpResponse.json({ ...base, display_name: name });
  }),

  http.post(`${API}/auth/change-password`, async ({ request }) => {
    const { deny } = await gate(request);
    if (deny) return deny;
    const body = (await request.json()) as {
      current_password?: string;
      new_password?: string;
    };
    if (!body.current_password) {
      return errorEnvelope("VALIDATION_ERROR", "請輸入目前密碼。", 422);
    }
    if (!body.new_password || body.new_password.length < 6) {
      return errorEnvelope("VALIDATION_ERROR", "新密碼不能少於 6 位。", 422);
    }
    // Mock accounts accept any non-empty current password.
    return HttpResponse.json({ success: true });
  }),

  // --- frontend-only: MFA ------------------------------------------------------
  http.post(`${API}/auth/mfa/challenge`, async ({ request }) => {
    const { deny } = await gate(request, { authed: false });
    if (deny) return deny;
    const challenge = authStore.beginChallenge();
    return HttpResponse.json({
      challenge_id: challenge.challengeId,
      methods: challenge.methods,
      expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
    });
  }),

  http.post(`${API}/auth/mfa/verify`, async ({ request }) => {
    const { deny } = await gate(request, { authed: false });
    if (deny) return deny;
    const body = (await request.json().catch(() => ({}))) as { code?: string };
    const outcome = authStore.verifyMfa(body.code ?? "");
    if (outcome === "no-session") {
      return errorEnvelope("UNAUTHORIZED", "請先輸入帳戶及密碼。", 401);
    }
    if (outcome === "invalid-code") {
      return errorEnvelope("VALIDATION_ERROR", "驗證碼不正確，請再試一次。", 422);
    }
    const session = authStore.currentSession();
    if (!session) {
      return errorEnvelope("UNAUTHORIZED", "請先輸入帳戶及密碼。", 401);
    }
    return HttpResponse.json(loginResponseFor(session), {
      headers: {
        "Set-Cookie": sessionCookieHeader(session.account.role),
      },
    });
  }),

  // --- frontend-only: recovery ---------------------------------------------------
  http.post(`${API}/auth/recovery/start`, async ({ request }) => {
    const { deny } = await gate(request, { authed: false });
    if (deny) return deny;
    return HttpResponse.json({ success: true });
  }),

  // --- frontend-only: account discovery + clinic selection ------------------------
  http.get(`${API}/auth/clinics`, async ({ request }) => {
    const { deny } = await gate(request, { authed: false });
    if (deny) return deny;
    return HttpResponse.json({
      items: authStore.accountClinics(),
      // ADR 0041 §6: tells the journey whether a multi-clinic identity picks a
      // clinic (separated) or lands straight in the merged workspace.
      workspace_separation: authStore.currentWorkspaceSeparation(),
    });
  }),

  http.post(`${API}/auth/clinics/select`, async ({ request }) => {
    const { deny } = await gate(request, { authed: false });
    if (deny) return deny;
    const body = (await request.json().catch(() => ({}))) as { clinic_id?: number };
    const ok = authStore.selectClinic(Number(body.clinic_id));
    const session = authStore.currentSession();
    if (!ok || !session) {
      return errorEnvelope("NOT_FOUND", "診所不存在或不屬於此帳戶。", 404);
    }
    return HttpResponse.json({ success: true, ...loginResponseFor(session) });
  }),

  // --- frontend-only: session state + refresh --------------------------------------
  http.get(`${API}/auth/session`, async ({ request }) => {
    const { scenario, deny } = await gate(request, { authed: false });
    if (deny) return deny;
    const session = authStore.currentSession();
    const expired = scenario.sessionExpired || Boolean(session?.expired);
    return HttpResponse.json({
      authenticated: Boolean(session) && !expired,
      user_id: session?.account.user_id ?? null,
      role: session?.account.role ?? null,
      clinic_id: session?.clinicId ?? null,
      display_name: session?.account.display_name ?? null,
      mfa_verified: session?.mfaVerified ?? false,
      merged_workspace: authStore.isMergedWorkspace(session),
      expires_at: session?.expiresAt ?? null,
    });
  }),

  http.post(`${API}/auth/session/refresh`, async ({ request }) => {
    const { deny } = await gate(request, { authed: false });
    if (deny) return deny;
    const session = authStore.refreshSession();
    if (!session) {
      return errorEnvelope("UNAUTHORIZED", "登入已過期，請重新登入。", 401);
    }
    return HttpResponse.json({
      authenticated: true,
      user_id: session.account.user_id,
      role: session.account.role,
      clinic_id: session.clinicId,
      display_name: session.account.display_name,
      mfa_verified: session.mfaVerified,
      merged_workspace: authStore.isMergedWorkspace(session),
      expires_at: session.expiresAt,
    });
  }),

  // --- frontend-only: deep-link tokens ----------------------------------------------
  http.post(`${API}/auth/session/deep-link`, async ({ request }) => {
    const { deny } = await gate(request, { authed: false });
    if (deny) return deny;
    const body = (await request.json().catch(() => ({}))) as { return_target?: string };
    const target = body.return_target ?? "";
    if (!authStore.isAllowedReturnTarget(target)) {
      return errorEnvelope(
        "VALIDATION_ERROR",
        "返回目標不在允許清單內。 Return target is not on the allowlist.",
        422,
      );
    }
    const issued = authStore.issueDeepLink(target);
    return HttpResponse.json({
      token: issued.token,
      return_target: target,
      expires_at: issued.expiresAt,
    });
  }),

  http.post(`${API}/auth/session/deep-link/redeem`, async ({ request }) => {
    const { deny } = await gate(request, { authed: false });
    if (deny) return deny;
    const body = (await request.json().catch(() => ({}))) as { token?: string };
    const target = authStore.redeemDeepLink(body.token ?? "");
    return HttpResponse.json({ valid: target !== null, return_target: target });
  }),
];
