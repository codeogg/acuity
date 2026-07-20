// Mount harness — a minimal consuming app used to review and e2e-test the
// auth journeys in isolation. Not part of the workspace build graph; started
// with `pnpm --filter @acuity/auth-ui dev` (port 3006).

import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    "@acuity/auth-ui",
    "@acuity/ui",
    "@acuity/api-client",
    "@acuity/types",
    "@acuity/i18n",
  ],
};

export default withNextIntl(nextConfig);
