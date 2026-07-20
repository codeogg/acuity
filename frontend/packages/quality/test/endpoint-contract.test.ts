// Shape check: every path the api-client endpoint modules call (including the
// frontend-only modules) must exist in the canonical OpenAPI contract
// (packages/types/openapi.json — the backend-implemented operations plus the
// x-backend-status forward contract). The check is static — endpoint sources
// are scanned for api.<verb>("...") calls and template-literal paths are
// matched against the spec with parameter segments treated as wildcards — so
// it survives endpoint additions without pinning a count.

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

// Workspace-relative resolution (this package lives in the same monorepo);
// resolving by path keeps the check independent of each package's exports map.
const apiClientDir = fileURLToPath(new URL("../../api-client", import.meta.url));
const typesDir = fileURLToPath(new URL("../../types", import.meta.url));

const spec = JSON.parse(
  readFileSync(join(typesDir, "openapi.json"), "utf8"),
) as { paths: Record<string, Record<string, unknown>> };

const VERBS = ["get", "post", "put", "patch", "delete", "postForm"] as const;
const VERB_TO_METHOD: Record<string, string> = {
  get: "get",
  post: "post",
  put: "put",
  patch: "patch",
  delete: "delete",
  postForm: "post",
};

interface CalledEndpoint {
  file: string;
  verb: string;
  path: string;
  // True when the call overrides the client's "/api" base (options.base), so
  // the declared path is matched as-is instead of /api-prefixed.
  baseOverride: boolean;
}

// Extract api.<verb>("/path") and api.<verb>(`/path/${id}`) calls.
function extractCalls(file: string, source: string): CalledEndpoint[] {
  const calls: CalledEndpoint[] = [];
  const re = new RegExp(
    `api\\.(${VERBS.join("|")})(?:<[^>]*>)?\\(\\s*(?:"([^"]+)"|\`([^\`]+)\`)`,
    "g",
  );
  for (const match of source.matchAll(re)) {
    const verb = match[1]!;
    const raw = match[2] ?? match[3]!;
    // Template placeholders become wildcard segments.
    const path = raw.replace(/\$\{[^}]+\}/g, "{param}");
    const rest = source.slice(match.index! + match[0].length, match.index! + match[0].length + 120);
    const baseOverride = /^\s*,\s*\{[^}]*\bbase\s*:/.test(rest);
    calls.push({ file, verb, path, baseOverride });
  }
  return calls;
}

// Match a called path (with {param} wildcards) against a declared spec path (with
// named {parameters}). Segment counts must match; literal segments must match
// exactly; any {x} segment on either side is a wildcard.
function pathsMatch(called: string, declared: string): boolean {
  const a = called.split("/").filter(Boolean);
  const b = declared.split("/").filter(Boolean);
  if (a.length !== b.length) return false;
  return a.every((seg, i) => {
    const other = b[i]!;
    if (seg.startsWith("{") || other.startsWith("{")) return true;
    return seg === other;
  });
}

describe("api-client endpoints vs the canonical OpenAPI spec", () => {
  const endpointsDir = join(apiClientDir, "src", "endpoints");
  const frontendOnlyDir = join(endpointsDir, "frontend-only");
  const files = [
    ...readdirSync(endpointsDir)
      .filter((f) => f.endsWith(".ts") && f !== "index.ts")
      .map((f) => join(endpointsDir, f)),
    ...readdirSync(frontendOnlyDir)
      .filter((f) => f.endsWith(".ts") && f !== "index.ts")
      .map((f) => join(frontendOnlyDir, f)),
  ];
  const calls = files.flatMap((f) => extractCalls(f, readFileSync(f, "utf8")));

  it("finds endpoint calls to check", () => {
    expect(calls.length).toBeGreaterThan(20);
  });

  it("every called path + method exists in the canonical spec", () => {
    const declared = Object.entries(spec.paths);
    const misses: string[] = [];
    for (const call of calls) {
      // The client prefixes the same-origin /api base unless the call
      // overrides it (e.g. the root-level /health probe).
      const full = call.baseOverride ? call.path : `/api${call.path}`;
      const method = VERB_TO_METHOD[call.verb]!;
      const hit = declared.some(
        ([declaredPath, ops]) =>
          pathsMatch(full, declaredPath) && method in ops,
      );
      if (!hit) misses.push(`${call.file}: ${method.toUpperCase()} ${full}`);
    }
    expect(misses, `endpoints missing from the canonical spec:\n${misses.join("\n")}`).toEqual([]);
  });

  it("spec itself is well-formed (paths + operations)", () => {
    const opCount = Object.values(spec.paths).reduce(
      (count, ops) =>
        count +
        Object.keys(ops).filter((m) =>
          ["get", "post", "put", "patch", "delete"].includes(m),
        ).length,
      0,
    );
    expect(Object.keys(spec.paths).length).toBeGreaterThanOrEqual(104);
    expect(opCount).toBeGreaterThanOrEqual(133);
  });
});
