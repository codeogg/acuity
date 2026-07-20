// Swappable auth adapter — the interim-contract seam.
//
// The demo backend authenticates with a custom JWT set as an httpOnly
// `access_token` cookie. The spec target is WorkOS + MFA. Both are expressed
// behind this single AuthAdapter interface so swapping the identity provider is
// a one-line change (`setAuthAdapter(workosAdapter)`), not a rewrite of every
// caller. Apps read the current user / trigger login through the adapter, never
// by calling the auth endpoints directly.

import type { LoginRequest, LoginResponse, MeResponse } from "@acuity/types";

export interface AuthAdapter {
  // Provider identifier, for diagnostics.
  readonly name: string;
  // Authenticate. Demo path takes username/password; a WorkOS path may ignore
  // credentials and redirect to a hosted flow instead (returning after callback).
  login(credentials: LoginRequest): Promise<LoginResponse>;
  // Clear the session.
  logout(): Promise<void>;
  // Resolve the current identity, or null when unauthenticated.
  currentUser(): Promise<MeResponse | null>;
  // Refresh the session where the provider supports it. The demo JWT is
  // stateless with no refresh, so this is a no-op there.
  refresh(): Promise<void>;
}
