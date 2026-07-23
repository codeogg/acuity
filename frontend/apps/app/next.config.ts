import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Transpile the workspace UI package (ships TS/JSX source, not pre-built).
  // @acuity/api-client re-exports the MSW authoring primitives (http /
  // HttpResponse via ./mocks, setupWorker via ./mocks/browser-runtime), so the
  // app's mock modules reach msw through the package with no bundler alias.
  transpilePackages: [
    "@acuity/ui",
    "@acuity/api-client",
    "@acuity/auth-ui",
    "@acuity/types",
    "@acuity/i18n",
  ],
  // Same-origin /api/* proxy to the real backend when not mocking. The target
  // is an env var NAME only; no value is committed. In mock-first mode MSW
  // intercepts /api/* before it reaches the network, so no rewrite is needed.
  async rewrites() {
    const target = process.env.API_PROXY_TARGET;
    if (!target) return [];
    return [
      { source: "/api/:path*", destination: `${target}/api/:path*` },
      // Signature / PDF assets use /local-storage/{key} proxy paths from FastAPI.
      { source: "/local-storage/:path*", destination: `${target}/local-storage/:path*` },
    ];
  },
};

export default withNextIntl(nextConfig);
