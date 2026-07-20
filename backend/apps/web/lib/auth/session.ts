import { cookies } from "next/headers";

import { apiFetch } from "@/lib/api/client";
import type { MeResponse } from "@/lib/api/types";

/** 在 Server Component 中读取当前用户，未登录返回 null。 */
export async function getSession(): Promise<MeResponse | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("access_token")?.value;
  if (!token) return null;
  try {
    return await apiFetch<MeResponse>("/api/auth/me", {
      cookie: `access_token=${token}`,
    });
  } catch {
    return null;
  }
}

/** 供 Server Component 透传给后端的 cookie 头。 */
export async function getCookieHeader(): Promise<string> {
  const cookieStore = await cookies();
  const token = cookieStore.get("access_token")?.value;
  return token ? `access_token=${token}` : "";
}
