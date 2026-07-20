import type { NextConfig } from "next";

// Internal design-review harness — no i18n, no API. Serves the live token
// review surfaces (type scale, colour roster, component surfaces, fonts,
// brand kit) against the real @acuity/ui stylesheet, so token edits are
// reflected on reload.
const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@acuity/ui"],
};

export default nextConfig;
