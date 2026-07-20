#!/usr/bin/env node
// Generate the backend reconciliation checklist from the canonical contract.
//
// Single source of truth: packages/types/openapi.json — every operation the
// frontend calls, with backend-implemented ops untagged and frontend-required
// forward-contract ops tagged x-backend-status (MISSING / PARTIAL / DRIFT /
// FUTURE-AUTH). src/endpoints/frontend-only.registry.json supplies the
// frontend-implementation metadata (typed function, module, surfaces, matrix
// reference); scripts/verify-data-layer.mjs asserts the two never drift.
//
// Emits docs/api/endpoint-checklist.md — a human-readable table grouping every
// endpoint by surface with its status. The backend team's to-do list.
//
// Usage:  node packages/api-client/scripts/gen-endpoint-checklist.mjs
//         (or: pnpm -F @acuity/api-client gen:endpoint-checklist)

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = resolve(HERE, "..");
const REPO = resolve(PKG, "../..");
const SPEC = resolve(REPO, "packages/types/openapi.json");
const REGISTRY = resolve(PKG, "src/endpoints/frontend-only.registry.json");
const OUT = resolve(REPO, "docs/api/endpoint-checklist.md");

const METHODS = ["get", "post", "put", "patch", "delete"];

const spec = JSON.parse(readFileSync(SPEC, "utf8"));
const registry = JSON.parse(readFileSync(REGISTRY, "utf8"));

// ---------------------------------------------------------------------------
// Surface classification. Contract ops classify deterministically by path
// prefix (the backend routers are surface-scoped); registry ops carry their
// module's surfaces, first entry = primary owner.
// ---------------------------------------------------------------------------

function surfaceForPath(path) {
  if (path.startsWith("/api/auth/")) return "auth";
  if (path.startsWith("/api/doctor/")) return "app";
  if (path.startsWith("/api/admin/")) return "admin";
  return "shared";
}

// ---------------------------------------------------------------------------
// Row assembly: walk the canonical spec; join frontend-only rows onto the
// registry for module metadata.
// ---------------------------------------------------------------------------

const registryByKey = new Map();
for (const mod of registry.modules) {
  for (const op of mod.ops) {
    registryByKey.set(`${op.method} ${op.path}`, { op, mod });
  }
}

const rows = [];

for (const [path, item] of Object.entries(spec.paths)) {
  for (const method of METHODS) {
    const op = item[method];
    if (!op) continue;
    const status = op["x-backend-status"];
    if (!status) {
      rows.push({
        method: method.toUpperCase(),
        path,
        surface: surfaceForPath(path),
        status: "EXISTS",
        summary: op.summary ?? "",
        note: op["x-implementation-note"],
        source: "contract",
      });
      continue;
    }
    const reg = registryByKey.get(`${method.toUpperCase()} ${path}`);
    rows.push({
      method: method.toUpperCase(),
      path,
      surface: reg ? reg.mod.surfaces[0] : surfaceForPath(path),
      surfaces: reg?.mod.surfaces,
      status,
      summary: reg ? `\`${reg.op.fn}\` — ${reg.mod.reason}` : (op.summary ?? ""),
      note: op["x-implementation-note"],
      matrix: reg?.mod.matrix,
      source: "frontend-only",
    });
  }
}

const bodyExtensions = registry.modules.flatMap((mod) =>
  (mod.body_extensions ?? []).map((ext) => ({ ...ext, module: mod.name })),
);

// ---------------------------------------------------------------------------
// endpoint-checklist.md
// ---------------------------------------------------------------------------

const STATUS_ORDER = ["EXISTS", "DRIFT", "PARTIAL", "MISSING", "FUTURE-AUTH"];

const surfaceTitle = {
  app: "Doctor app (`apps/app`) — /doctor/*",
  admin: "Operator console (`apps/admin`) — /admin/*",
  auth: "Auth journeys (`packages/auth-ui`, mounted in app + console) — /auth/*",
  shared: "Shared (`/health`, cross-surface)",
};

function count(status) {
  return rows.filter((r) => r.status === status).length;
}

function buildChecklistMd() {
  let md = "";
  md += "# Frontend endpoint checklist — backend to-do\n\n";
  md += "**Generated:** by `packages/api-client/scripts/gen-endpoint-checklist.mjs` (re-run to refresh; do not edit by hand).\n";
  md += "**Source:** `packages/types/openapi.json` (the canonical contract) joined with `packages/api-client/src/endpoints/frontend-only.registry.json` (frontend-implementation metadata).\n";
  md += "**Parity guarantee:** `packages/api-client/scripts/verify-data-layer.mjs` asserts spec-registry parity plus one typed function and one MSW handler per operation.\n\n";
  md += "Every row is an endpoint the frontend calls. **EXISTS** = implemented by the demo backend; ";
  md += "**MISSING** = the frontend needs it and the demo API has no equivalent; ";
  md += "**PARTIAL** = backend substrate exists but no usable API; ";
  md += "**DRIFT** = overlaps or conflicts with an existing contract op (reconcile with the backend); ";
  md += "**FUTURE-AUTH** = spec-target auth-provider journey beyond the demo backend. ";
  md += "Contract dialect (full statement in the spec's `info.description` and `docs/api/implementation-notes.md`): ";
  md += "snake_case, `{items,total,page,page_size}` list envelope, `{error:{code,message}}` error envelope ";
  md += "(messages may be Chinese), JWT bearer / httpOnly `access_token` cookie auth, cross-tenant -> 404 not 403, ";
  md += "`row_version` optimistic lock -> 409.\n\n";

  md += "## Summary\n\n";
  md += "| Status | Count |\n|---|---|\n";
  for (const status of STATUS_ORDER) md += `| ${status} | ${count(status)} |\n`;
  md += `| **Total frontend endpoints** | **${rows.length}** |\n\n`;

  for (const surface of ["app", "admin", "auth", "shared"]) {
    const list = rows.filter((r) => r.surface === surface);
    if (list.length === 0) continue;
    list.sort(
      (a, b) =>
        STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) ||
        a.path.localeCompare(b.path) ||
        a.method.localeCompare(b.method),
    );
    md += `## ${surfaceTitle[surface]}\n\n`;
    md += "| Status | Method | Path | Notes |\n|---|---|---|---|\n";
    for (const r of list) {
      const parts = [];
      if (r.source === "contract") {
        parts.push(r.summary);
      } else {
        parts.push(`${r.summary}${r.matrix ? ` (${r.matrix})` : ""}`);
        if (r.surfaces && r.surfaces.length > 1) parts.push(`also: ${r.surfaces.slice(1).join(", ")}`);
      }
      if (r.note) parts.push(r.note);
      md += `| ${r.status} | ${r.method} | \`${r.path}\` | ${parts.filter(Boolean).join(" — ").replaceAll("|", "\\|")} |\n`;
    }
    md += "\n";
  }

  if (bodyExtensions.length > 0) {
    md += "## Body extensions on contract ops (backend asks)\n\n";
    md += "Extra fields the frontend sends on real contract operations — folded into the canonical schemas as optional properties and declared here rather than drifting silently.\n\n";
    md += "| Status | Operation | Extended type | Added fields | Module |\n|---|---|---|---|---|\n";
    for (const ext of bodyExtensions) {
      md += `| ${ext.backend_status} | \`${ext.op}\` | \`${ext.type}\` | ${ext.adds.map((a) => `\`${a}\``).join(", ")} | ${ext.module} |\n`;
    }
    md += "\n";
  }

  return md;
}

// ---------------------------------------------------------------------------

function main() {
  writeFileSync(OUT, buildChecklistMd());
  const statusLine = STATUS_ORDER.map((s) => `${count(s)} ${s}`).join(" / ");
  console.log(`endpoint checklist: ${rows.length} endpoints — ${statusLine}`);
  console.log(`body extensions: ${bodyExtensions.length}`);
  console.log(`wrote ${OUT}`);
}

main();
