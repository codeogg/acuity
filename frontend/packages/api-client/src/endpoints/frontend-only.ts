// frontend-only: pending backend
//
// Machine-readable registry of every FRONTEND-ONLY endpoint module — reference
// features with no backend equivalent, mock-implemented in full so every state
// in the surface matrices is demo-reachable. The endpoint-checklist generator
// (scripts/gen-endpoint-checklist.mjs) reads the JSON side of this registry to
// surface each op to the backend team mechanically; the data-layer verify
// script asserts registry <-> module <-> handler parity.
//
// Canonical data lives in ./frontend-only.registry.json (one source of truth,
// consumable by scripts without a TS loader); this module is the typed view.

import registry from "./frontend-only.registry.json";

export const FRONTEND_ONLY_MARKER = "frontend-only: pending backend";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

// Backend reconciliation status for a frontend-only op:
//   MISSING     — no backend equivalent at all.
//   PARTIAL     — backend substrate exists (a table, an internal hook) but no
//                 usable API.
//   DRIFT       — overlaps or conflicts with an existing contract op;
//                 reconcile with the backend rather than add.
//   FUTURE-AUTH — spec-target auth-provider journey beyond the demo backend.
export type BackendStatus = "MISSING" | "PARTIAL" | "DRIFT" | "FUTURE-AUTH";

export interface FrontendOnlyOp {
  method: HttpMethod;
  path: string;
  fn: string;
  req: string | null;
  res: string | null;
  backend_status: BackendStatus;
  // An MSW handler answers this op (asserted by scripts/verify-data-layer.mjs).
  msw_implemented: boolean;
}

export interface FrontendOnlyBodyExtension {
  op: string;
  type: string;
  adds: string[];
  backend_status: BackendStatus;
}

export interface FrontendOnlyModule {
  name: string;
  module: string;
  surfaces: string[];
  reason: string;
  matrix: string;
  ops: FrontendOnlyOp[];
  body_extensions?: FrontendOnlyBodyExtension[];
}

export const frontendOnlyRegistry =
  registry.modules as unknown as FrontendOnlyModule[];

export function frontendOnlyOps(): FrontendOnlyOp[] {
  return frontendOnlyRegistry.flatMap((m) => m.ops);
}

export function frontendOnlyOpCount(): number {
  return frontendOnlyOps().length;
}
