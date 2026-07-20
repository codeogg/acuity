// @acuity/api-client — the single typed fetch layer over the backend /api/*
// contract. Apps import endpoint functions, the auth adapter facade, and the
// ApiError type from here; MSW mocks are under the ./mocks/* subpaths.

export { ApiError, api, request, setServerSessionHeadersProvider } from "./client";
export type { ApiErrorKind, RequestOptions, ServerSessionHeadersProvider } from "./client";

export {
  auth,
  getAuthAdapter,
  setAuthAdapter,
  demoJwtCookieAdapter,
  workosAdapter,
} from "./auth/index";
export type { AuthAdapter } from "./auth/index";

export * from "./endpoints/index";

// Re-export the contract types for convenience so callers can import shapes and
// functions from one place.
export type * from "@acuity/types";
