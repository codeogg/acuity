import { createAuthPage, operatorAuthMount } from "@acuity/auth-ui";

// Operator sign-in — the hardened console entry from the shared auth journey
// package: distinct-host signal, hardware-key MFA (LD3 determinate steps), no
// language toggle, wrong-role sessions rejected outright. Signed-out visits to
// any console route land here via the middleware gate; the preserved deep link
// returns the operator to the exact path after re-authentication.
export default createAuthPage({
  ...operatorAuthMount,
  landingPath: "/clinics",
  // Keep the shared journey's Mock bootstrap in sync with this app's API
  // mode. Without this explicit setting, AuthJourney defaults to MSW even
  // when the console itself is configured for the live FastAPI backend.
  mocks: process.env.NEXT_PUBLIC_API_MOCKING !== "disabled",
  // The FastAPI integration does not implement the FUTURE-AUTH MFA endpoints
  // yet. This opt-in is deliberately local-development-only.
  skipMfa:
    process.env.NODE_ENV !== "production" &&
    process.env.NEXT_PUBLIC_DEV_SKIP_OPERATOR_MFA === "true",
});
