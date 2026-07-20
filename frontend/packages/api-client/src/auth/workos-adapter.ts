// WorkOS auth adapter — the spec-target STUB.
//
// The commissioned product replaces the demo's custom JWT with WorkOS + MFA
// (see backend-review.md spec-compliance notes; acuity-dev docs/design S3
// identity = WorkOS / OIDC with mandatory MFA on the operator console). This is
// the swap seam: when the WorkOS-backed backend exists, implement these methods
// against the hosted flow (redirect to WorkOS, handle the callback, read the
// session) and switch the app over with `setAuthAdapter(workosAdapter)`.
//
// It is intentionally unimplemented so the shape is fixed now and no caller
// silently depends on the demo JWT.

import type { LoginRequest, LoginResponse, MeResponse } from "@acuity/types";
import type { AuthAdapter } from "./adapter";

function notImplemented(method: string): never {
  throw new Error(
    `workosAdapter.${method} is not implemented yet. WorkOS + MFA is the ` +
      `spec target; wire this adapter when the WorkOS-backed backend exists, ` +
      `then swap it in via setAuthAdapter(workosAdapter).`,
  );
}

export const workosAdapter: AuthAdapter = {
  name: "workos",

  async login(_credentials: LoginRequest): Promise<LoginResponse> {
    return notImplemented("login");
  },

  async logout(): Promise<void> {
    return notImplemented("logout");
  },

  async currentUser(): Promise<MeResponse | null> {
    return notImplemented("currentUser");
  },

  async refresh(): Promise<void> {
    return notImplemented("refresh");
  },
};
