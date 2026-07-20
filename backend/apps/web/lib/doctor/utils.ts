import type { ClaimStatus } from "@/lib/api/types";
import type { AppLocale } from "@/lib/i18n/types";

/** 根据当前时段返回问候语前缀 */
export function getGreetingPrefix(date = new Date(), locale: AppLocale = "zh-HK"): string {
  const hour = date.getHours();
  if (locale === "en-HK") {
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  }
  if (hour < 12) return "早上好";
  if (hour < 18) return "下午好";
  return "晚上好";
}

/** 草稿/填报流程应跳转的路径，back 为返回目标 URL（可选） */
export function claimFlowUrl(
  submissionId: number,
  status: ClaimStatus,
  back?: string,
): string {
  let base: string;
  switch (status) {
    case "DRAFT":
      base = `/doctor/claims/new?id=${submissionId}&step=record`;
      break;
    case "AI_FILLED":
      base = `/doctor/claims/new?id=${submissionId}&step=review`;
      break;
    case "CONFIRMED":
      base = `/doctor/claims/new?id=${submissionId}&step=preview`;
      break;
    default:
      return `/doctor/claims/${submissionId}`;
  }
  return back ? `${base}&back=${encodeURIComponent(back)}` : base;
}

/** 历史记录列表 URL，保留搜索条件与页码 */
export function claimsListUrl(params?: {
  q?: string;
  status?: string;
  page?: number;
}): string {
  const sp = new URLSearchParams();
  if (params?.q) sp.set("q", params.q);
  if (params?.status) sp.set("status", params.status);
  if (params?.page && params.page > 1) sp.set("page", String(params.page));
  const qs = sp.toString();
  return qs ? `/doctor/claims?${qs}` : "/doctor/claims";
}

/** 解析填报页 back 参数，决定返回链接与文案 */
export function resolveClaimBack(back: string | null | undefined): {
  href: string;
  label: string;
};
export function resolveClaimBack(
  back: string | null | undefined,
  locale: AppLocale,
): { href: string; label: string };
export function resolveClaimBack(
  back: string | null | undefined,
  locale: AppLocale = "zh-HK",
): { href: string; label: string } {
  const dashboardLabel = locale === "en-HK" ? "Back to dashboard" : "返回工作台";
  const historyLabel = locale === "en-HK" ? "Back to history" : "返回歷史記錄";
  if (!back) {
    return { href: "/doctor", label: dashboardLabel };
  }
  let decoded = back;
  try {
    decoded = decodeURIComponent(back);
  } catch {
    decoded = back;
  }
  if (decoded.startsWith("/doctor/claims")) {
    return { href: decoded, label: historyLabel };
  }
  return {
    href: decoded.startsWith("/") ? decoded : "/doctor",
    label: dashboardLabel,
  };
}

/** 向已有 URL 追加 query 参数 */
export function appendQueryParam(url: string, key: string, value: string): string {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}${key}=${encodeURIComponent(value)}`;
}

/** 格式化为 HH:mm（香港 locale） */
export function formatTimeShort(iso: string, locale: AppLocale = "zh-HK"): string {
  return new Date(iso).toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** 相对时间（如：刚刚、5分钟前、2小时前、3天前；更早则显示日期） */
export function formatRelativeTime(
  iso: string,
  now = new Date(),
  locale: AppLocale = "zh-HK",
): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";

  const diffMs = now.getTime() - date.getTime();
  if (diffMs < 0) return locale === "en-HK" ? "just now" : "剛剛";

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return locale === "en-HK" ? "just now" : "剛剛";
  if (minutes < 60) return locale === "en-HK" ? `${minutes} min ago` : `${minutes} 分鐘前`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return locale === "en-HK" ? `${hours} hr ago` : `${hours} 小時前`;

  const days = Math.floor(hours / 24);
  if (days < 7) return locale === "en-HK" ? `${days} days ago` : `${days} 天前`;

  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString(locale, {
    year: sameYear ? undefined : "numeric",
    month: "numeric",
    day: "numeric",
  });
}
