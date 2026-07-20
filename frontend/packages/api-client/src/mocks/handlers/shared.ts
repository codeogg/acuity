// Shared plumbing for the mock handlers: the /api base, the Page[T] envelope,
// the error envelope, and the per-request scenario gate every handler runs
// first (latency + global failure/session-expiry injection).

import type { Page } from "@acuity/types";
import {
  errorEnvelope,
  scenarioDelay,
  scenarioFailure,
  scenarioFor,
  type MockScenario,
} from "../scenario";

export const API = "/api";

export { errorEnvelope };

export function page<T>(items: T[], pageNo = 1, pageSize = 20): Page<T> {
  const start = (pageNo - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    total: items.length,
    page: pageNo,
    page_size: pageSize,
  };
}

export function pageQuery(request: Request): { pageNo: number; pageSize: number } {
  const url = new URL(request.url);
  return {
    pageNo: Math.max(1, Number(url.searchParams.get("page")) || 1),
    pageSize: Math.max(1, Number(url.searchParams.get("page_size")) || 20),
  };
}

// Run the scenario gate: resolve the effective scenario, apply latency, then
// short-circuit on global failure / expired session. Returns the scenario plus
// an optional response to return immediately.
export async function gate(
  request: Request,
  options: { authed?: boolean } = {},
): Promise<{ scenario: MockScenario; deny: Response | null }> {
  const scenario = scenarioFor(request);
  await scenarioDelay(scenario);
  return { scenario, deny: scenarioFailure(scenario, options) };
}

export function notFoundZh(message: string): Response {
  return errorEnvelope("NOT_FOUND", message, 404);
}

export function conflictZh(): Response {
  return errorEnvelope("CONFLICT", "此記錄已被另一個視窗更改，請重新載入。", 409);
}
