import { createAuthPage, doctorAuthMount } from "@acuity/auth-ui";

// Doctor sign-in mount — the warm everyday-clinic entry. The harness work
// home stands in for the doctor app's landing.
export default createAuthPage({
  ...doctorAuthMount,
  landingPath: "/forms",
  peerSignInHref: "/operator/sign-in",
});
