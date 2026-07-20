/**
 * 轻量 API 客户端。
 *
 * 强类型来源：CI/本地执行 `npm run gen:api` 会基于后端 OpenAPI 生成
 * `lib/api/generated/schema.d.ts`，可配合 openapi-fetch 获得端到端类型安全。
 * 此处提供一个可独立运行的 fetch 封装，保证在类型未生成时前端也能构建。
 */

/** 浏览器直连 FastAPI（localhost 与前端同站，cookie 可携带）。 */
export function resolveApiBaseUrl(): string {
  if (typeof window !== "undefined") {
    return process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
  }
  return (
    process.env.API_INTERNAL_URL ??
    process.env.API_PROXY_TARGET ??
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    "http://localhost:8000"
  );
}

/** @deprecated 请用 resolveApiBaseUrl()；保留供 PDF 等静态资源拼接 */
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

export interface ApiError {
  code: string;
  message: string;
}

function networkMessage(
  key: "timeout" | "unreachable" | "failed" | "status",
  status?: number,
): string {
  const english =
    typeof document !== "undefined" &&
    document.cookie.split("; ").includes("locale=en-HK");
  const messages = english
    ? {
        timeout: "Request timed out. Please try again later.",
        unreachable: "Unable to connect to the API service.",
        failed: "Network request failed.",
        status: `Request failed (${status ?? "unknown"})`,
      }
    : {
        timeout: "請求逾時，請稍後再試",
        unreachable: "無法連接後端服務，請確認 API 已啟動並可連線",
        failed: "網絡請求失敗",
        status: `請求失敗 (${status ?? "未知"})`,
      };
  return messages[key];
}

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, error: ApiError) {
    super(error.message);
    this.status = status;
    this.code = error.code;
  }
}

type RequestOptions = {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  /** 传入服务端组件里读取到的 cookie 头，用于 SSR 透传鉴权 */
  cookie?: string;
  /** 请求超时（毫秒）；OCR 等长耗时接口建议 300000+ */
  timeoutMs?: number;
  formData?: FormData;
  signal?: AbortSignal;
};

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const base = resolveApiBaseUrl();
  const url = base
    ? new URL(path.startsWith("http") ? path : `${base}${path}`)
    : new URL(path.startsWith("http") ? path : path, window.location.origin);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

export async function apiFetch<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  let body: BodyInit | undefined;

  if (options.formData) {
    body = options.formData;
  } else if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }
  if (options.cookie) {
    headers["Cookie"] = options.cookie;
  }

  const init: RequestInit = {
    method: options.method ?? "GET",
    headers,
    credentials: "include",
    cache: "no-store",
  };
  if (body !== undefined) init.body = body;
  if (options.timeoutMs != null) {
    init.signal = AbortSignal.timeout(options.timeoutMs);
  } else if (options.signal) {
    init.signal = options.signal;
  }

  let res: Response;
  try {
    res = await fetch(buildUrl(path, options.query), init);
  } catch (err) {
    const aborted =
      err instanceof DOMException && err.name === "TimeoutError";
    const msg = aborted
      ? networkMessage("timeout")
      : err instanceof TypeError || (err instanceof Error && err.message === "Failed to fetch")
        ? networkMessage("unreachable")
        : err instanceof Error
          ? err.message
          : networkMessage("failed");
    throw new Error(msg);
  }

  if (!res.ok) {
    let error: ApiError = { code: "UNKNOWN", message: networkMessage("status", res.status) };
    try {
      const data = (await res.json()) as { error?: ApiError };
      if (data.error) error = data.error;
    } catch {
      /* ignore parse error */
    }
    throw new ApiRequestError(res.status, error);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
