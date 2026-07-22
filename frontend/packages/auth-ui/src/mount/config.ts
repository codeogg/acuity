// Mount configuration — everything a consuming app declares to adopt the auth
// journeys. The doctor app and the operator console mount the SAME journey
// component with different configs: role gate, landing destination, and the
// distinct console hostname are config, not forks. In production the two
// surfaces live on distinct hostnames; here the hostname is simulated by the
// per-app mount (each app serves only its own sign-in) plus the host-signal
// copy in `hostName`.

import type { AuthSurfaceKind } from "../journey/types";

// Mock-mode session marker. MSW's synthetic responses cannot set a real
// httpOnly cookie in the browser jar, so the journey sets this readable
// marker at landing and clears it at sign-out; the middleware session gate
// accepts either the real `access_token` cookie (live backend) or this marker
// (mock-first). Never carries a credential — presence-only.
export const MOCK_SESSION_COOKIE = "acuity_mock_session";

export interface AuthMountConfig {
  surface: AuthSurfaceKind;
  // Locale-relative path of the sign-in page inside the consuming app.
  signInPath: string;
  // Default post-auth destination (locale-relative internal path) when no
  // deep-link target was preserved. Doctor -> the work home; operator -> the
  // Clinics portfolio.
  landingPath: string;
  // Roles this surface accepts. A session with any other role is rejected
  // outright (per-app session isolation) and rendered as permission-denied.
  allowedRoles: readonly string[];
  // Operator distinct-host signal override; defaults to the catalog copy.
  hostName?: string;
  // Where the doctor surface's "go to the operator console" link points.
  // Locale-relative internal path, or an absolute console URL in production.
  peerSignInHref?: string;
  // Footer legal links (the site owns the pages; defaults below).
  privacyHref?: string;
  termsHref?: string;
  // Mock-mode identity used when ?demo-account= is not provided. Overridable
  // per entry so every credential outcome is demo-reachable.
  demoAccount?: string;
  // Mock-first switch: start the MSW worker and use demo identities. Flip to
  // false when the app runs against a live backend.
  mocks?: boolean;
  // Local integration escape hatch while a real MFA provider is not available.
  // Consumers must only set this in non-production environments.
  skipMfa?: boolean;
}

export const doctorAuthMount: AuthMountConfig = {
  surface: "doctor",
  signInPath: "/sign-in",
  landingPath: "/",
  allowedRoles: ["DOCTOR", "STAFF"],
  privacyHref: "/privacy",
  termsHref: "/terms",
};

export const operatorAuthMount: AuthMountConfig = {
  surface: "operator",
  signInPath: "/sign-in",
  landingPath: "/clinics",
  allowedRoles: ["OPERATOR", "SUPER_ADMIN", "ANNOTATOR", "SUPPORT", "READ_ONLY"],
  privacyHref: "/privacy",
  termsHref: "/terms",
};
