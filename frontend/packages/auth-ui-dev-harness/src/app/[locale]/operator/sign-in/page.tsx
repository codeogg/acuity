import { createAuthPage, operatorAuthMount } from "@acuity/auth-ui";

// Operator sign-in mount — the hardened console entry: distinct-host signal,
// hardware-key MFA (LD3), no language toggle. In production this lives on the
// console hostname; the harness simulates the distinct host via the mount.
export default createAuthPage({
  ...operatorAuthMount,
  landingPath: "/clinics",
});
