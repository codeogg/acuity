// Auth adapter registry. Apps read `auth` (the active adapter) and may swap the
// provider once at startup via setAuthAdapter. Defaults to the demo JWT cookie
// adapter (the current backend contract).

import type { AuthAdapter } from "./adapter";
import { demoJwtCookieAdapter } from "./demo-jwt-cookie-adapter";

export type { AuthAdapter } from "./adapter";
export { demoJwtCookieAdapter } from "./demo-jwt-cookie-adapter";
export { workosAdapter } from "./workos-adapter";

let activeAdapter: AuthAdapter = demoJwtCookieAdapter;

export function setAuthAdapter(adapter: AuthAdapter): void {
  activeAdapter = adapter;
}

export function getAuthAdapter(): AuthAdapter {
  return activeAdapter;
}

// Facade so callers write `auth.login(...)` against whichever adapter is active.
export const auth: AuthAdapter = {
  get name() {
    return activeAdapter.name;
  },
  login: (credentials) => activeAdapter.login(credentials),
  logout: () => activeAdapter.logout(),
  currentUser: () => activeAdapter.currentUser(),
  refresh: () => activeAdapter.refresh(),
};
