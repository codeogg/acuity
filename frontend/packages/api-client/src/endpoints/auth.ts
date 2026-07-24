// Auth endpoints. Prefer the `auth` adapter facade for login/logout/currentUser;
// these are the raw typed functions the demo adapter is built on and are exposed
// for direct use where an adapter is not appropriate.

import type {
  LoginRequest,
  LoginResponse,
  MeResponse,
  ProfileUpdateRequest,
  SuccessResponse,
} from "@acuity/types";
import { api, type RequestOptions } from "../client";

export type ChangePasswordRequest = {
  current_password: string;
  new_password: string;
};

export function login(body: LoginRequest): Promise<LoginResponse> {
  return api.post<LoginResponse>("/auth/login", body);
}

export function logout(): Promise<SuccessResponse> {
  return api.post<SuccessResponse>("/auth/logout");
}

export function me(options?: RequestOptions): Promise<MeResponse> {
  return api.get<MeResponse>("/auth/me", options);
}

export function updateMe(
  body: ProfileUpdateRequest,
  options?: RequestOptions,
): Promise<MeResponse> {
  return api.patch<MeResponse>("/auth/me", body, options);
}

export function changePassword(
  body: ChangePasswordRequest,
  options?: RequestOptions,
): Promise<SuccessResponse> {
  return api.post<SuccessResponse>("/auth/change-password", body, options);
}
