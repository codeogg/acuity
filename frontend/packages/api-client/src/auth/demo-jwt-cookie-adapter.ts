// Demo JWT cookie adapter — the current (interim) auth implementation.
//
// Matches the demo backend exactly: POST /api/auth/login sets an httpOnly
// `access_token` cookie; GET /api/auth/me resolves the identity; POST
// /api/auth/logout clears the cookie. The token is stateless (HS256, 8h) with
// no refresh, so refresh() is a no-op. Because the cookie is httpOnly, the
// browser never touches the token in JavaScript.

import type { LoginRequest, LoginResponse, MeResponse } from "@acuity/types";
import { ApiError, api } from "../client";
import type { AuthAdapter } from "./adapter";

export const demoJwtCookieAdapter: AuthAdapter = {
  name: "demo-jwt-cookie",

  async login(credentials: LoginRequest): Promise<LoginResponse> {
    return api.post<LoginResponse>("/auth/login", credentials);
  },

  async logout(): Promise<void> {
    await api.post<{ success: boolean }>("/auth/logout");
  },

  async currentUser(): Promise<MeResponse | null> {
    try {
      return await api.get<MeResponse>("/auth/me");
    } catch (error) {
      // 401 -> unauthenticated is a normal, expected outcome, not an error.
      if (error instanceof ApiError && error.kind === "unauthorized") {
        return null;
      }
      throw error;
    }
  },

  async refresh(): Promise<void> {
    // Stateless JWT: nothing to refresh. No-op by design.
  },
};
