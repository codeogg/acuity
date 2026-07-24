// Typed endpoint functions grouped by domain — one function per operation in
// the canonical contract (packages/types/openapi.json), split into the
// backend-implemented groups below plus the FRONTEND-ONLY modules (forward
// contract pending backend, registered in ./frontend-only.registry.json).
// Parity is asserted by scripts/verify-data-layer.mjs. Import a group as a
// namespace (e.g. `import { claims } from "@acuity/api-client"`).

export * as ai from "./ai";
export * as audit from "./audit";
export * as authEndpoints from "./auth";
export * as claims from "./claims";
export * as clinics from "./clinics";
export * as companies from "./companies";
export * as districts from "./districts";
export type { DistrictCreate, DistrictOut, DistrictUpdate } from "./districts";
export * as doctors from "./doctors";
export * as fields from "./fields";
export * as health from "./health";
export * as templates from "./templates";
export * as tickets from "./tickets";
export * as claimsOversight from "./claims-oversight";
export * as analytics from "./frontend-only/admin-analytics";

// Frontend-only surface (pending backend) + its machine-readable registry.
export * as frontendOnly from "./frontend-only/index";
export {
  FRONTEND_ONLY_MARKER,
  frontendOnlyOpCount,
  frontendOnlyOps,
  frontendOnlyRegistry,
} from "./frontend-only";
export type {
  BackendStatus,
  FrontendOnlyBodyExtension,
  FrontendOnlyModule,
  FrontendOnlyOp,
  HttpMethod,
} from "./frontend-only";

// Account-model body-extension shapes (dev ADR 0041) — the mock-first
// extensions consoles join onto DoctorOut/ClinicOut.
export type {
  ClinicAccountOut,
  ClinicNotesExtension,
  DoctorAccountExtension,
  DoctorAccountOut,
  WorkspaceSeparation,
} from "./frontend-only/account-management";

// Session-facing account-model extensions (dev ADR 0040/0041): MFA opt-in +
// the merged-workspace marker on login/me/session, clinic attribution on the
// doctor claims list.
export type {
  AccountSessionExtension,
  LoginResponseExtended,
  MeResponseExtended,
} from "./frontend-only/auth-flow";
export type {
  ClaimListItemClinic,
  ClaimListItemWithClinic,
} from "./frontend-only/claim-extensions";
