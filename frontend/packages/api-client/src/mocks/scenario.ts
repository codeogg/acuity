// Mock scenario engine — one runtime switchboard controlling how the MSW mock
// backend behaves, so every state in the surface matrices is demo-reachable
// without a backend.
//
// Three control layers, lowest to highest precedence:
//   1. Env default:   NEXT_PUBLIC_MOCK_SCENARIO="slow-network,ai-degrade"
//      (comma-separated scenario names, parsed once at module init).
//   2. Runtime state: setMockScenario({ aiDegrade: true }) — a framework-free
//      external store. A dev-only UI mounts it via React's useSyncExternalStore
//      (subscribeMockScenario / getMockScenario) — no React dependency here.
//   3. Per-request:   ?scenario=<name> on any mocked request (one-shot, wins).
//
// Scenario names (the canonical set, also listed in the package README):
//   baseline            — reset everything to defaults
//   slow-network        — ~900ms latency on every response
//   very-slow-network   — ~2500ms latency
//   fast-network        — ~150ms latency (default is none)
//   server-error        — every request returns 500 {error:{code,message}}
//   network-error       — every request fails at the transport layer
//   conflict-409        — every state-changing write returns 409 (optimistic lock)
//   tenant-404          — every tenant-scoped detail read returns 404 (isolation)
//   ai-degrade          — AI extraction returns 503 AI_UNAVAILABLE (force_manual)
//   session-expired     — every authed request returns 401 (re-auth journey)
//   empty-data          — every list endpoint returns an empty page
//   operator-role       — the mock session identity is the operator, not the doctor
//
// Handlers consume the engine through the helpers at the bottom (scenarioDelay,
// scenarioFailure, listItems, isAiDegraded, isConflict, isTenantNotFound).

import { HttpResponse, delay } from "msw";

export interface MockScenario {
  latency: "none" | "fast" | "slow" | "very-slow";
  failure: "none" | "server-error" | "network-error";
  conflict: boolean;
  tenantNotFound: boolean;
  aiDegrade: boolean;
  sessionExpired: boolean;
  emptyData: boolean;
  role: "doctor" | "operator";
}

export const DEFAULT_SCENARIO: MockScenario = {
  latency: "none",
  failure: "none",
  conflict: false,
  tenantNotFound: false,
  aiDegrade: false,
  sessionExpired: false,
  emptyData: false,
  role: "doctor",
};

// Canonical scenario-name -> partial-state mapping (also drives env parsing and
// the ?scenario= per-request override).
export const SCENARIO_NAMES = {
  "baseline": {},
  "fast-network": { latency: "fast" },
  "slow-network": { latency: "slow" },
  "very-slow-network": { latency: "very-slow" },
  "server-error": { failure: "server-error" },
  "network-error": { failure: "network-error" },
  "conflict-409": { conflict: true },
  "tenant-404": { tenantNotFound: true },
  "ai-degrade": { aiDegrade: true },
  "session-expired": { sessionExpired: true },
  "empty-data": { emptyData: true },
  "operator-role": { role: "operator" },
} satisfies Record<string, Partial<MockScenario>>;

export type MockScenarioName = keyof typeof SCENARIO_NAMES;

function fromNames(names: string[]): MockScenario {
  let state: MockScenario = { ...DEFAULT_SCENARIO };
  for (const raw of names) {
    const name = raw.trim() as MockScenarioName;
    if (name === "baseline") {
      state = { ...DEFAULT_SCENARIO };
    } else if (name in SCENARIO_NAMES) {
      state = { ...state, ...SCENARIO_NAMES[name] };
    }
  }
  return state;
}

function envDefault(): MockScenario {
  const raw =
    typeof process !== "undefined"
      ? process.env?.NEXT_PUBLIC_MOCK_SCENARIO
      : undefined;
  if (!raw) return { ...DEFAULT_SCENARIO };
  return fromNames(raw.split(","));
}

// --- the external store (useSyncExternalStore-compatible) --------------------

let current: MockScenario = envDefault();
const listeners = new Set<() => void>();

export function getMockScenario(): MockScenario {
  return current;
}

export function setMockScenario(partial: Partial<MockScenario>): void {
  current = { ...current, ...partial };
  for (const notify of listeners) notify();
}

export function applyMockScenarioName(name: MockScenarioName): void {
  current = name === "baseline" ? { ...DEFAULT_SCENARIO } : { ...current, ...SCENARIO_NAMES[name] };
  for (const notify of listeners) notify();
}

export function resetMockScenario(): void {
  current = { ...DEFAULT_SCENARIO };
  for (const notify of listeners) notify();
}

export function subscribeMockScenario(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// --- per-request resolution ---------------------------------------------------

// Effective scenario for one request: runtime state + one-shot ?scenario= names.
export function scenarioFor(request: Request): MockScenario {
  const url = new URL(request.url);
  const params = url.searchParams.getAll("scenario");
  if (params.length === 0) return current;
  // Back-compat aliases used by existing surfaces.
  const aliased = params.map((p) =>
    p === "ai-unavailable" ? "ai-degrade" : p,
  );
  let state = current;
  for (const name of aliased) {
    if (name in SCENARIO_NAMES) {
      state = { ...state, ...SCENARIO_NAMES[name as MockScenarioName] };
    }
  }
  return state;
}

// --- handler helpers -----------------------------------------------------------

const LATENCY_MS: Record<MockScenario["latency"], number> = {
  "none": 0,
  "fast": 150,
  "slow": 900,
  "very-slow": 2500,
};

export async function scenarioDelay(scenario: MockScenario): Promise<void> {
  const ms = LATENCY_MS[scenario.latency];
  if (ms > 0) await delay(ms);
}

export function errorEnvelope(
  code: string,
  message: string,
  status: number,
): Response {
  return HttpResponse.json({ error: { code, message } }, { status });
}

// Global failure / session-expiry gate. Returns a Response to short-circuit
// with, or null to proceed. Call at the top of every handler (after delay).
export function scenarioFailure(
  scenario: MockScenario,
  options: { authed?: boolean } = {},
): Response | null {
  if (scenario.failure === "network-error") return HttpResponse.error();
  if (scenario.failure === "server-error") {
    return errorEnvelope("APP_ERROR", "系統暫時無法處理請求，請稍後再試。", 500);
  }
  if ((options.authed ?? true) && scenario.sessionExpired) {
    return errorEnvelope("UNAUTHORIZED", "登入已過期，請重新登入。", 401);
  }
  return null;
}

// Empty-data gate for list endpoints.
export function listItems<T>(scenario: MockScenario, items: T[]): T[] {
  return scenario.emptyData ? [] : items;
}

export function isAiDegraded(scenario: MockScenario): boolean {
  return scenario.aiDegrade;
}

export function isConflict(scenario: MockScenario): boolean {
  return scenario.conflict;
}

export function isTenantNotFound(scenario: MockScenario): boolean {
  return scenario.tenantNotFound;
}
