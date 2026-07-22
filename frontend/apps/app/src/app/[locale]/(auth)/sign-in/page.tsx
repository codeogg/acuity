import { createAuthPage, doctorAuthMount } from "@acuity/auth-ui";

// Doctor sign-in — MFA applies only when the account has mfa_enabled (backend
// returns mfa_required on login). Set skipMfa: true to bypass during local dev.
export default createAuthPage({
  ...doctorAuthMount,
  landingPath: "/",
  peerSignInHref: process.env.NEXT_PUBLIC_CONSOLE_SIGN_IN_URL ?? "/sign-in",
  mocks: process.env.NEXT_PUBLIC_API_MOCKING !== "disabled",
  skipMfa: process.env.NEXT_PUBLIC_SKIP_MFA === "true",
});
