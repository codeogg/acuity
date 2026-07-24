import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// Mock-first data path: the console's server components and server actions
// fetch the /api contract against this app's own catch-all route
// (src/app/api/[...path]/route.ts), which dispatches through the shared MSW
// admin handler set over one stateful fixture universe. Server-side fetch
// needs an absolute base, so mock mode defaults to the app's own origin
// (port fixed by the dev/start scripts). In live mode set
// NEXT_PUBLIC_API_BASE to the deployment's API origin.
const mocking = process.env.NEXT_PUBLIC_API_MOCKING !== "disabled";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Every workspace dependency ships TS/JSX source, not pre-built output.
  transpilePackages: [
    "@acuity/ui",
    "@acuity/api-client",
    "@acuity/auth-ui",
    "@acuity/types",
    "@acuity/i18n",
  ],
  serverExternalPackages: ["msw"],
  env: {
    // Browser: same-origin /api (rewritten to FastAPI). SSR absolute base is
    // resolved in @acuity/api-client from API_PROXY_TARGET / API_SERVER_BASE.
    NEXT_PUBLIC_API_BASE:
      process.env.NEXT_PUBLIC_API_BASE ??
      (mocking
        ? "http://localhost:3002/api"
        : process.env.API_PROXY_TARGET
          ? "/api"
          : "http://localhost:8000/api"),
    NEXT_PUBLIC_AUTH_SURFACE: "admin",
  },
  // In live integration mode, keep browser requests same-origin so the
  // FastAPI access_token cookie is available to the console middleware.
  // beforeFiles is required because this app also has a mock catch-all
  // /api route that must not intercept real backend requests.
  async rewrites() {
    const target = process.env.API_PROXY_TARGET;
    if (!target) return [];
    return {
      beforeFiles: [
        { source: "/api/:path*", destination: `${target}/api/:path*` },
        { source: "/local-storage/:path*", destination: `${target}/local-storage/:path*` },
      ],
    };
  },
  async redirects() {
    // The Templates routes were folded into the Forms destination.
    return [
      {
        source: "/:locale(en-HK|zh-Hant-HK)/templates",
        destination: "/:locale/forms",
        permanent: false,
      },
      {
        source: "/:locale(en-HK|zh-Hant-HK)/templates/:id",
        destination: "/:locale/forms/:id",
        permanent: false,
      },
    ];
  },
};

export default withNextIntl(nextConfig);
