import type { NextConfig } from "next";
import { loadEnvConfig } from "@next/env";

// 确保 next.config 能读到 apps/web/.env.local 中的 API_PROXY_TARGET
loadEnvConfig(process.cwd());

const apiProxyTarget =
  process.env.API_PROXY_TARGET ?? "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  // 生成的 API 类型与三方类型交由 CI 的 tsc/eslint 步骤统一把关，避免构建被 lint 阻断
  eslint: { ignoreDuringBuilds: true },
  // 开发环境：浏览器走同源 /api，由 Next 转发到后端，避免跨域与端口不一致
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiProxyTarget}/api/:path*`,
      },
      {
        source: "/local-storage/:path*",
        destination: `${apiProxyTarget}/local-storage/:path*`,
      },
    ];
  },
};

export default nextConfig;
