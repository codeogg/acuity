import { resolveApiBaseUrl } from "@/lib/api/client";

/** 将存储 URL 规范为可访问的同源 /local-storage 路径。 */
export function resolveStorageUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith("/local-storage/")) return url;
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").filter(Boolean);
    // MinIO 路径形如 /{bucket}/{key...}，去掉 bucket 前缀
    if (segments.length >= 2) {
      return `/local-storage/${segments.slice(1).join("/")}`;
    }
  } catch {
    /* 非绝对 URL，原样返回 */
  }
  return url;
}

/** 服务端渲染时拼接 API 基址；浏览器走同源相对路径。 */
export function resolveStorageUrlWithBase(url: string): string {
  const normalized = resolveStorageUrl(url);
  if (!normalized.startsWith("/local-storage/")) return normalized;
  const base = resolveApiBaseUrl();
  return base ? `${base}${normalized}` : normalized;
}
