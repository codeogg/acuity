import { createAuthPage, doctorAuthMount } from "@acuity/auth-ui";

// Doctor sign-in — the shared auth journey mounted with this app's config
// (packages/auth-ui/README.md §Mounting). Landing is the work home; the
// operator-console link resolves from the deployment env (name only), falling
// back to this app's own sign-in path until the console hostname exists.
export default createAuthPage({
  ...doctorAuthMount,
  landingPath: "/",
  peerSignInHref: process.env.NEXT_PUBLIC_CONSOLE_SIGN_IN_URL ?? "/sign-in",
});
