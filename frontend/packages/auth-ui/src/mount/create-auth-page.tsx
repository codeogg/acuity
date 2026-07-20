// Page factory — a consuming app mounts a sign-in route with two lines:
//
//   // app/[locale]/(auth)/sign-in/page.tsx
//   import { createAuthPage, doctorAuthMount } from "@acuity/auth-ui";
//   export default createAuthPage({ ...doctorAuthMount, landingPath: "/" });
//
// The page is a server component; the journey below it is the client island.

import { AuthJourney } from "../components/auth-journey";
import type { AuthMountConfig } from "./config";

export function createAuthPage(config: AuthMountConfig) {
  return async function AuthSignInPage({
    params,
  }: {
    params: Promise<{ locale: string }>;
  }) {
    const { locale } = await params;
    return <AuthJourney config={config} locale={locale} />;
  };
}
