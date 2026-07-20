// Auth endpoints. Prefer the `auth` adapter facade for login/logout/currentUser;
// these are the raw typed functions the demo adapter is built on and are exposed
// for direct use where an adapter is not appropriate.

import type { LoginRequest, LoginResponse, MeResponse, SuccessResponse } from "@acuity/types";
import { api } from "../client";

export function login(body: LoginRequest): Promise<LoginResponse> {
  return api.post<LoginResponse>("/auth/login", body);
}

export function logout(): Promise<SuccessResponse> {
  return api.post<SuccessResponse>("/auth/logout");
}

export function me(): Promise<MeResponse> {
  return api.get<MeResponse>("/auth/me");
}
