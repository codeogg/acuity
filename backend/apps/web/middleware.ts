import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * 路由级鉴权：仅校验是否存在 access_token cookie；
 * 细粒度角色/诊所权限由后端依赖注入层二次校验（见 deps.py）。
 */
export function middleware(request: NextRequest) {
  const token = request.cookies.get("access_token")?.value;
  const { pathname } = request.nextUrl;

  const isProtected =
    pathname.startsWith("/admin") || pathname.startsWith("/doctor");

  if (isProtected && !token) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin", "/admin/:path*", "/doctor", "/doctor/:path*"],
};
