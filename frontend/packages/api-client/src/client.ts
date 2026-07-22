// Core typed fetch layer over the backend /api/* contract.
//
// Contract (see tasks/frontend-workstream/backend-review.md):
//   - Base is same-origin `/api/*`, NO version prefix. Configurable via
//     NEXT_PUBLIC_API_BASE for server-side/direct calls.
//   - snake_case request/response fields, preserved verbatim.
//   - Auth is an httpOnly `access_token` cookie -> credentials: "include".
//   - Two error shapes: native FastAPI 422 { detail: [...] } and the domain
//     envelope { error: { code, message } }. Messages may be Chinese.
//   - Typed outcomes for 409 (optimistic lock, row_version) and 404 (tenant
//     isolation returns not-found for cross-tenant access).

import type {
  ApiErrorCode,
  ApiErrorEnvelope,
  HTTPValidationError,
} from "@acuity/types";

// Default base: same-origin "/api". Next.js apps proxy /api/* to the backend
// (or MSW intercepts it in mock-first mode). Override with NEXT_PUBLIC_API_BASE.
function resolveBaseUrl(): string {
  const fromEnv =
    typeof process !== "undefined" ? process.env?.NEXT_PUBLIC_API_BASE : undefined;
  return (fromEnv ?? "/api").replace(/\/$/, "");
}

export type ApiErrorKind =
  | "validation" // 422 native FastAPI
  | "conflict" // 409 optimistic-lock / unique
  | "not_found" // 404 (incl. tenant-isolation not-found)
  | "unauthorized" // 401
  | "forbidden" // 403
  | "rate_limited" // 429
  | "ai_unavailable" // 503
  | "network" // fetch/transport failure
  | "unknown"; // anything else

// Single error type every endpoint function rejects with. Callers branch on
// `kind` for typed outcomes (409, 404, ...) without parsing raw responses.
export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number;
  readonly code?: ApiErrorCode | string;
  readonly validation?: HTTPValidationError["detail"];
  readonly body?: unknown;

  constructor(init: {
    kind: ApiErrorKind;
    status: number;
    message: string;
    code?: ApiErrorCode | string;
    validation?: HTTPValidationError["detail"];
    body?: unknown;
  }) {
    super(init.message);
    this.name = "ApiError";
    this.kind = init.kind;
    this.status = init.status;
    this.code = init.code;
    this.validation = init.validation;
    this.body = init.body;
  }

  get isConflict(): boolean {
    return this.kind === "conflict";
  }
  get isNotFound(): boolean {
    return this.kind === "not_found";
  }
}

function kindForStatus(status: number): ApiErrorKind {
  switch (status) {
    case 401:
      return "unauthorized";
    case 403:
      return "forbidden";
    case 404:
      return "not_found";
    case 409:
      return "conflict";
    case 422:
      return "validation";
    case 429:
      return "rate_limited";
    case 503:
      return "ai_unavailable";
    default:
      return "unknown";
  }
}

function isValidationError(body: unknown): body is HTTPValidationError {
  return (
    typeof body === "object" &&
    body !== null &&
    Array.isArray((body as { detail?: unknown }).detail)
  );
}

function isErrorEnvelope(body: unknown): body is ApiErrorEnvelope {
  return (
    typeof body === "object" &&
    body !== null &&
    typeof (body as ApiErrorEnvelope).error === "object" &&
    (body as ApiErrorEnvelope).error !== null &&
    typeof (body as ApiErrorEnvelope).error.message === "string"
  );
}

// Serializable query values. A plain scalar map; accepts typed query interfaces
// (which lack an implicit index signature) because it is a mapped type, not a
// Record with a required index signature.
export type QueryScalar = string | number | boolean | undefined | null;
export type QueryParams = { [key: string]: QueryScalar };

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  // JSON body (serialized). Omit for GET / no-body requests.
  json?: unknown;
  // FormData body for the two multipart upload endpoints. Overrides `json`.
  form?: FormData;
  // Query params appended to the path. Accepts any object whose values are
  // serializable scalars (interfaces without an index signature included).
  query?: QueryParams;
  signal?: AbortSignal;
  headers?: Record<string, string>;
  // Base-path override for the rare op not under /api (the root /health probe).
  // Pass "" to call the path against the origin root.
  base?: string;
}

/**
 * Optional framework adapter for server-side request context. It is a
 * provider, not stored session data: the adapter runs in the active request
 * scope and returns that request's headers.
 */
export type ServerSessionHeadersProvider = () => Promise<Record<string, string>>;

let serverSessionHeadersProvider: ServerSessionHeadersProvider | undefined;

export function setServerSessionHeadersProvider(
  provider: ServerSessionHeadersProvider | undefined,
): void {
  serverSessionHeadersProvider = provider;
}

async function implicitServerSessionHeaders(
  explicitHeaders: Record<string, string> | undefined,
): Promise<Record<string, string>> {
  if (
    typeof window !== "undefined" ||
    explicitHeaders?.cookie !== undefined ||
    explicitHeaders?.Cookie !== undefined ||
    !serverSessionHeadersProvider
  ) {
    return {};
  }

  try {
    return await serverSessionHeadersProvider();
  } catch {
    // A provider may only be available in a framework request scope.
    return {};
  }
}

function buildQuery(
  query: RequestOptions["query"],
): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    params.set(key, String(value));
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

// The single low-level request. Returns parsed JSON typed as T, or throws
// ApiError. 204 responses resolve to undefined (cast to T by callers that
// declare a void-ish T).
export async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const base = options.base ?? resolveBaseUrl();
  const url = `${base}${path}${buildQuery(options.query)}`;

  const headers: Record<string, string> = {
    ...(await implicitServerSessionHeaders(options.headers)),
    ...options.headers,
  };
  let body: BodyInit | undefined;

  if (options.form) {
    body = options.form; // browser sets multipart boundary automatically
  } else if (options.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.json);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? "GET",
      headers,
      body,
      // Send the httpOnly access_token cookie on every request.
      credentials: "include",
      signal: options.signal,
      // Authenticated console reads must not reuse a Next.js Data Cache entry
      // across keyword / filter URL changes.
      cache: "no-store",
    });
  } catch (cause) {
    throw new ApiError({
      kind: "network",
      status: 0,
      message: cause instanceof Error ? cause.message : "Network request failed",
      body: cause,
    });
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get("content-type") ?? "";
  const parsed: unknown = contentType.includes("application/json")
    ? await response.json().catch(() => undefined)
    : await response.text().catch(() => undefined);

  if (response.ok) {
    return parsed as T;
  }

  // Error path: distinguish the two envelope shapes.
  if (response.status === 422 && isValidationError(parsed)) {
    throw new ApiError({
      kind: "validation",
      status: 422,
      message: parsed.detail?.[0]?.msg ?? "Validation error",
      validation: parsed.detail,
      body: parsed,
    });
  }

  if (isErrorEnvelope(parsed)) {
    throw new ApiError({
      kind: kindForStatus(response.status),
      status: response.status,
      message: parsed.error.message,
      code: parsed.error.code,
      body: parsed,
    });
  }

  throw new ApiError({
    kind: kindForStatus(response.status),
    status: response.status,
    message: `Request failed with status ${response.status}`,
    body: parsed,
  });
}

// Convenience verbs.
export const api = {
  get: <T>(path: string, options?: Omit<RequestOptions, "method" | "json" | "form">) =>
    request<T>(path, { ...options, method: "GET" }),
  post: <T>(path: string, json?: unknown, options?: Omit<RequestOptions, "method">) =>
    request<T>(path, { ...options, method: "POST", json }),
  put: <T>(path: string, json?: unknown, options?: Omit<RequestOptions, "method">) =>
    request<T>(path, { ...options, method: "PUT", json }),
  patch: <T>(path: string, json?: unknown, options?: Omit<RequestOptions, "method">) =>
    request<T>(path, { ...options, method: "PATCH", json }),
  delete: <T>(path: string, options?: Omit<RequestOptions, "method" | "json" | "form">) =>
    request<T>(path, { ...options, method: "DELETE" }),
  postForm: <T>(path: string, form: FormData, options?: Omit<RequestOptions, "method" | "form">) =>
    request<T>(path, { ...options, method: "POST", form }),
};
