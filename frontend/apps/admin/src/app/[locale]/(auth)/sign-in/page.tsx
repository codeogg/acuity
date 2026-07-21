import { createAuthPage, operatorAuthMount } from "@acuity/auth-ui";

// Operator sign-in — the hardened console entry from the shared auth journey
// package. MFA is temporarily skipped product-wide; re-enable later via
// skipMfa: false once backend MFA endpoints ship.
export default createAuthPage({
  ...operatorAuthMount,
  landingPath: "/clinics",
  // Keep the shared journey's Mock bootstrap in sync with this app's API
  // mode. Without this explicit setting, AuthJourney defaults to MSW even
  // when the console itself is configured for the live FastAPI backend.
  mocks: process.env.NEXT_PUBLIC_API_MOCKING !== "disabled",
  skipMfa: true,
});
