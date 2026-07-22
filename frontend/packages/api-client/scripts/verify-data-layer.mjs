#!/usr/bin/env node
// Data-layer verification — asserts the parity invariants the mock-first
// architecture rests on, failing loud (exit 1) on any breach:
//
//   1. Spec-registry parity: every operation in the canonical contract
//      (packages/types/openapi.json) tagged x-backend-status appears in
//      frontend-only.registry.json with the same status, and vice versa — the
//      spec owns the contract, the registry owns frontend-implementation
//      metadata, and neither may drift from the other.
//   2. Contract parity: the typed endpoint modules export exactly one function
//      per backend-implemented operation (no x-backend-status), and every
//      registered FRONTEND-ONLY op has its typed function.
//   3. Handler coverage: every contract op AND every frontend-only op has an
//      MSW handler in src/mocks/handlers/**, and every registry op carries a
//      valid backend_status tag with a truthful msw_implemented flag.
//   4. Fixture coherence: universe.json cross-references resolve (claims point
//      at existing clinics/doctors/companies/templates, coverage registry and
//      field schemas point at existing templates, frontend-only records point
//      at existing entities).
//
// Usage: node scripts/verify-data-layer.mjs   (or: pnpm -F @acuity/api-client verify)

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = resolve(HERE, "..");
const SPEC = resolve(PKG, "../types/openapi.json");
const REGISTRY = join(PKG, "src/endpoints/frontend-only.registry.json");
const UNIVERSE = join(PKG, "src/mocks/fixtures/universe.json");

let failures = 0;
const fail = (msg) => {
  failures += 1;
  console.error(`  ✗ ${msg}`);
};
const ok = (msg) => console.log(`  ✓ ${msg}`);

// --- inputs -------------------------------------------------------------------

const spec = JSON.parse(readFileSync(SPEC, "utf8"));
const registry = JSON.parse(readFileSync(REGISTRY, "utf8"));
const universe = JSON.parse(readFileSync(UNIVERSE, "utf8"));

const METHODS = ["get", "post", "put", "patch", "delete"];

// Spec ops as "METHOD /path" with {param} normalised to *, partitioned into
// backend-implemented (no x-backend-status) and frontend-only (tagged).
const normalise = (path) => path.replace(/\{[^}]+\}|:[A-Za-z_]+/g, "*");
const backendOps = []; // backend-implemented contract ops
const specFrontendOps = new Map(); // key -> x-backend-status
for (const [path, item] of Object.entries(spec.paths)) {
  for (const method of METHODS) {
    const op = item[method];
    if (!op) continue;
    const key = `${method.toUpperCase()} ${normalise(path)}`;
    if (op["x-backend-status"]) specFrontendOps.set(key, op["x-backend-status"]);
    else backendOps.push(key);
  }
}

const registryOps = registry.modules.flatMap((m) =>
  m.ops.map((op) => ({ ...op, module: m.module, key: `${op.method} ${normalise(op.path)}` })),
);

// --- 1. spec-registry parity -----------------------------------------------------

console.log("1. Spec-registry parity (openapi.json x-backend-status vs registry)");

const registryByKey = new Map(registryOps.map((op) => [op.key, op]));
let parityMisses = 0;
for (const [key, status] of specFrontendOps) {
  const reg = registryByKey.get(key);
  if (!reg) {
    fail(`spec op ${key} (x-backend-status ${status}) missing from the registry`);
    parityMisses += 1;
  } else if (reg.backend_status !== status) {
    fail(`spec op ${key} has x-backend-status ${status} but registry says ${reg.backend_status}`);
    parityMisses += 1;
  }
}
for (const op of registryOps) {
  if (!specFrontendOps.has(op.key)) {
    fail(`registry op ${op.key} missing from openapi.json (or untagged)`);
    parityMisses += 1;
  }
}
if (parityMisses === 0) {
  ok(`${specFrontendOps.size} frontend-only spec ops match ${registryOps.length} registry ops`);
}

// --- 2. contract parity ----------------------------------------------------------

console.log("2. Contract parity (typed endpoint functions vs spec)");

if (backendOps.length === 83) ok(`spec carries 83 backend-implemented operations`);
else fail(`spec has ${backendOps.length} backend-implemented operations, expected 83`);

const CONTRACT_MODULES = [
  "ai.ts", "audit.ts", "auth.ts", "claims.ts", "clinics.ts", "companies.ts",
  "doctors.ts", "fields.ts", "health.ts", "templates.ts",
];
let contractFnCount = 0;
for (const file of CONTRACT_MODULES) {
  const src = readFileSync(join(PKG, "src/endpoints", file), "utf8");
  contractFnCount += (src.match(/^export (?:async )?function /gm) ?? []).length;
}
if (contractFnCount === backendOps.length) {
  ok(`${contractFnCount} typed endpoint functions == ${backendOps.length} backend-implemented ops`);
} else {
  fail(`${contractFnCount} typed endpoint functions != ${backendOps.length} backend-implemented ops`);
}

let registryFnMisses = 0;
for (const op of registryOps) {
  const modulePath = join(PKG, "src/endpoints", `${op.module}.ts`);
  const src = readFileSync(modulePath, "utf8");
  if (!new RegExp(`^export (?:async )?function ${op.fn}\\b`, "m").test(src)) {
    fail(`registry op ${op.key} has no exported function ${op.fn} in ${op.module}.ts`);
    registryFnMisses += 1;
  }
}
if (registryFnMisses === 0) {
  ok(`${registryOps.length} frontend-only registry ops all have typed functions`);
}

const BACKEND_STATUSES = ["MISSING", "PARTIAL", "DRIFT", "FUTURE-AUTH"];
let tagMisses = 0;
for (const op of registryOps) {
  if (!BACKEND_STATUSES.includes(op.backend_status)) {
    fail(`registry op ${op.key} has no valid backend_status (got ${JSON.stringify(op.backend_status)})`);
    tagMisses += 1;
  }
  if (typeof op.msw_implemented !== "boolean") {
    fail(`registry op ${op.key} has no boolean msw_implemented flag`);
    tagMisses += 1;
  }
}
for (const m of registry.modules) {
  for (const ext of m.body_extensions ?? []) {
    if (!BACKEND_STATUSES.includes(ext.backend_status)) {
      fail(`body extension on ${ext.op} has no valid backend_status`);
      tagMisses += 1;
    }
  }
}
if (tagMisses === 0) {
  ok(`all registry ops carry backend_status + msw_implemented tags`);
}

// --- 3. handler coverage -----------------------------------------------------------

console.log("3. Handler coverage (every op answered by MSW)");

const handlerSources = ["handlers.ts", ...readdirSync(join(PKG, "src/mocks/handlers")).map((f) => `handlers/${f}`)]
  .filter((f) => f.endsWith(".ts"))
  .map((f) => readFileSync(join(PKG, "src/mocks", f), "utf8"))
  .join("\n");

const handlerOps = new Set();
const handlerRe = /http\.(get|post|put|patch|delete)\(\s*(?:`\$\{API\}([^`]*)`|"([^"]*)")/g;
for (const match of handlerSources.matchAll(handlerRe)) {
  const method = match[1].toUpperCase();
  const path = match[2] !== undefined ? `/api${match[2]}` : match[3];
  handlerOps.add(`${method} ${normalise(path)}`);
}

let uncovered = 0;
for (const op of backendOps) {
  if (!handlerOps.has(op)) {
    fail(`contract op has no handler: ${op}`);
    uncovered += 1;
  }
}
for (const op of registryOps) {
  const handled = handlerOps.has(op.key);
  if (op.msw_implemented && !handled) {
    fail(`frontend-only op tagged msw_implemented has no handler: ${op.key}`);
    uncovered += 1;
  } else if (!op.msw_implemented && handled) {
    fail(`frontend-only op has a handler but is tagged msw_implemented: false — fix the registry: ${op.key}`);
    uncovered += 1;
  } else if (!op.msw_implemented) {
    fail(`frontend-only op is not MSW-implemented (gap must be closed, not tagged away): ${op.key}`);
    uncovered += 1;
  }
}
if (uncovered === 0) {
  ok(`all ${backendOps.length} contract + ${registryOps.length} frontend-only ops have handlers (${handlerOps.size} handler routes)`);
}

// --- 4. fixture coherence -------------------------------------------------------------

console.log("4. Fixture coherence (universe.json cross-references)");

const ids = (rows) => new Set(rows.map((r) => r.id));
const clinicIds = ids(universe.clinics);
const doctorIds = ids(universe.doctors);
const companyIds = ids(universe.companies);
const templateIds = ids(universe.templates);
const domainIds = ids(universe.domains);
const standardFieldIds = ids(universe.standard_fields);
const claimIds = ids(universe.claims);
const tagIds = ids(universe.frontend_only.tags);

const check = (label, condition) => (condition ? null : fail(label));

for (const claim of universe.claims) {
  check(`claim ${claim.id}: clinic_id ${claim.clinic_id} not in clinics`, clinicIds.has(claim.clinic_id));
  check(`claim ${claim.id}: doctor_id ${claim.doctor_id} not in doctors`, doctorIds.has(claim.doctor_id));
  check(`claim ${claim.id}: company_id ${claim.company_id} not in companies`, companyIds.has(claim.company_id));
  check(`claim ${claim.id}: template_id ${claim.template_id} not in templates`, templateIds.has(claim.template_id));
}
for (const doctor of universe.doctors) {
  // Individual (unlinked) doctor accounts may have clinic_id: null (ADR 0041).
  if (doctor.clinic_id != null) {
    check(`doctor ${doctor.id}: clinic_id ${doctor.clinic_id} not in clinics`, clinicIds.has(doctor.clinic_id));
  }
}
for (const template of universe.templates) {
  check(`template ${template.id}: company_id ${template.company_id} not in companies`, companyIds.has(template.company_id));
}
for (const field of universe.standard_fields) {
  check(`standard field ${field.id}: domain_id ${field.domain_id} not in domains`, domainIds.has(field.domain_id));
}
for (const [templateId, fields] of Object.entries(universe.template_fields)) {
  check(`template_fields key ${templateId} not in templates`, templateIds.has(Number(templateId)));
  for (const field of fields) {
    const sf = field.mapping?.standard_field_id;
    if (sf != null) {
      check(`template field ${field.id}: mapped standard_field_id ${sf} missing`, standardFieldIds.has(sf));
    }
  }
}
for (const insurer of universe.coverage_registry) {
  check(`coverage registry company_id ${insurer.company_id} not in companies`, companyIds.has(insurer.company_id));
  for (const form of insurer.forms) {
    if (form.coverage === "covered") {
      check(`coverage form template_id ${form.template_id} not in templates`, templateIds.has(form.template_id));
    }
  }
}
for (const templateId of Object.keys(universe.field_schemas)) {
  check(`field_schemas key ${templateId} not in templates`, templateIds.has(Number(templateId)));
}
for (const claimId of Object.keys(universe.intake_records)) {
  check(`intake_records key ${claimId} not in claims`, claimIds.has(Number(claimId)));
}
check(
  `session doctor ${universe.meta.session_doctor_id} not in doctors`,
  doctorIds.has(universe.meta.session_doctor_id),
);
check(
  `session clinic ${universe.meta.session_clinic_id} not in clinics`,
  clinicIds.has(universe.meta.session_clinic_id),
);
for (const account of universe.auth.accounts) {
  for (const clinicId of account.clinic_ids) {
    check(`auth account ${account.login_account}: clinic ${clinicId} not in clinics`, clinicIds.has(clinicId));
  }
}
const fo = universe.frontend_only;
for (const handoff of fo.handoffs) {
  check(`handoff ${handoff.id}: claim_id ${handoff.claim_id} not in claims`, claimIds.has(handoff.claim_id));
}
for (const n of fo.notifications) {
  if (n.claim_id != null) {
    check(`notification ${n.id}: claim_id ${n.claim_id} not in claims`, claimIds.has(n.claim_id));
  }
}
for (const ticket of fo.tickets) {
  check(`ticket ${ticket.id}: clinic_id ${ticket.clinic_id} not in clinics`, clinicIds.has(ticket.clinic_id));
}
for (const item of fo.onboarding_queue) {
  check(`onboarding item clinic_id ${item.clinic_id} not in clinics`, clinicIds.has(item.clinic_id));
}
for (const v of fo.tag_visibility) {
  check(`tag visibility doctor_id ${v.doctor_id} not in doctors`, doctorIds.has(v.doctor_id));
  check(`tag visibility tag_id ${v.tag_id} not in tags`, tagIds.has(v.tag_id));
}
check(
  `doctor settings doctor_id ${fo.doctor_settings.doctor_id} is the session doctor`,
  fo.doctor_settings.doctor_id === universe.meta.session_doctor_id,
);

if (failures === 0) {
  ok("all fixture cross-references resolve");
  console.log(`\nPASS — ${backendOps.length} contract ops + ${registryOps.length} frontend-only ops verified.`);
} else {
  console.error(`\nFAIL — ${failures} problem(s).`);
  process.exit(1);
}
