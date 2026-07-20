// Builds the machine hand-back payload: a structured diff of every override
// against its ratified default, keyed by the canonical token path in
// docs/design/system/tokens/*.json (typography also references FINAL.md
// §Typography). Feeding this JSON back is enough to update the source of truth
// deterministically — each change carries its path, its old value, and its new
// value.

import {
  COLOR_TIERS,
  ELEVATION_TIERS,
  FONT_FAMILIES,
  TYPE_ROLES,
  RADIUS_TOKENS,
  SURFACE_GROUPS,
  layersToBoxShadow,
  type ShadowLayer,
  type TypeRole,
  type SurfaceProp,
} from "./tokens";
import type { Section } from "../review-state";

export type ExportScope = Section | "all";

type Overrides = {
  colorOverrides: Record<string, string>;
  elevationOverrides: Record<string, ShadowLayer[]>;
  familyOverrides: Record<string, string[]>;
  typeOverrides: Record<string, Partial<TypeRole>>;
  radiusOverrides: Record<string, string>;
  surfaceOverrides: Record<string, Partial<Record<SurfaceProp, string>>>;
  // Live baselines read from the deployed stylesheet — the authoritative "from".
  liveColor?: Record<string, string>;
  liveElevation?: Record<string, ShadowLayer[]>;
  liveRadius?: Record<string, string>;
};

const COLOR_BY_VAR = new Map<string, { name: string; tokenPath: string }>();
for (const tier of COLOR_TIERS)
  for (const e of tier.entries)
    if (!COLOR_BY_VAR.has(e.cssVar)) COLOR_BY_VAR.set(e.cssVar, { name: e.name, tokenPath: e.tokenPath });

const COLOR_DEFAULT = new Map<string, string>();
for (const tier of COLOR_TIERS) for (const e of tier.entries) COLOR_DEFAULT.set(e.cssVar, e.hex);
const RADIUS_DEFAULT = new Map<string, { value: string; tokenPath: string; name: string }>();
for (const r of RADIUS_TOKENS) RADIUS_DEFAULT.set(r.cssVar, { value: r.value, tokenPath: r.tokenPath, name: r.name });
const SURFACE_META = new Map<string, { name: string; def: Partial<Record<SurfaceProp, string>> }>();
for (const g of SURFACE_GROUPS) for (const s of g.surfaces) SURFACE_META.set(s.id, { name: s.name, def: s.style });

export type ExportPayload = {
  $meta: {
    tool: string;
    exportedAt: string;
    scope: ExportScope;
    changeCount: number;
    instructions: string;
  };
  colours: Array<{ name: string; cssVar: string; tokenPath: string; from: string; to: string }>;
  radius: Array<{ name: string; cssVar: string; tokenPath: string; from: string; to: string }>;
  elevation: Array<{ tier: string; cssVar: string | null; tokenPath: string | null; from: string; to: string; layers: ShadowLayer[] }>;
  surfaces: Array<{ id: string; name: string; changes: Record<string, { from: string; to: string }> }>;
  fontFamilies: Array<{ id: string; tokenPath: string; from: string[]; to: string[] }>;
  typeRoles: Array<{ id: string; tokenName: string; changes: Record<string, { from: unknown; to: unknown }>; note: string }>;
};

export function buildExport(scope: ExportScope, o: Overrides): ExportPayload {
  const wantColours = scope === "all" || scope === "colours";
  const wantSurfaces = scope === "all" || scope === "surfaces";
  const wantFonts = scope === "all" || scope === "fonts";

  const colours: ExportPayload["colours"] = [];
  if (wantColours) {
    for (const [cssVar, hex] of Object.entries(o.colorOverrides)) {
      const base = o.liveColor?.[cssVar] ?? COLOR_DEFAULT.get(cssVar);
      if (hex === base) continue;
      const meta = COLOR_BY_VAR.get(cssVar);
      colours.push({
        name: meta?.name ?? cssVar,
        cssVar,
        tokenPath: meta?.tokenPath ?? "",
        from: base ?? "",
        to: hex,
      });
    }
  }

  const radius: ExportPayload["radius"] = [];
  const elevation: ExportPayload["elevation"] = [];
  const surfaces: ExportPayload["surfaces"] = [];
  if (wantSurfaces) {
    for (const [cssVar, value] of Object.entries(o.radiusOverrides)) {
      const meta = RADIUS_DEFAULT.get(cssVar);
      const base = o.liveRadius?.[cssVar] ?? meta?.value;
      if (value === base) continue;
      radius.push({ name: meta?.name ?? cssVar, cssVar, tokenPath: meta?.tokenPath ?? "", from: base ?? "", to: value });
    }
    for (const [tierId, layers] of Object.entries(o.elevationOverrides)) {
      const tier = ELEVATION_TIERS.find((t) => t.id === tierId);
      const baseLayers = o.liveElevation?.[tierId] ?? tier?.layers ?? [];
      elevation.push({
        tier: tierId,
        cssVar: tier?.cssVar ?? null,
        tokenPath: tier?.tokenPath ?? null,
        from: layersToBoxShadow(baseLayers) || "none",
        to: layersToBoxShadow(layers) || "none",
        layers,
      });
    }
    for (const [id, patch] of Object.entries(o.surfaceOverrides)) {
      const meta = SURFACE_META.get(id);
      if (!meta) continue;
      const changes: Record<string, { from: string; to: string }> = {};
      for (const [k, v] of Object.entries(patch)) {
        changes[k] = { from: meta.def[k as SurfaceProp] ?? "(unset)", to: v };
      }
      if (Object.keys(changes).length === 0) continue;
      surfaces.push({ id, name: meta.name, changes });
    }
  }

  const fontFamilies: ExportPayload["fontFamilies"] = [];
  const typeRoles: ExportPayload["typeRoles"] = [];
  if (wantFonts) {
    for (const [id, stack] of Object.entries(o.familyOverrides)) {
      const fam = FONT_FAMILIES.find((f) => f.id === id);
      fontFamilies.push({ id, tokenPath: fam?.tokenPath ?? "", from: fam?.stack ?? [], to: stack });
    }
    for (const [id, patch] of Object.entries(o.typeOverrides)) {
      const def = TYPE_ROLES.find((r) => r.id === id);
      if (!def) continue;
      const changes: Record<string, { from: unknown; to: unknown }> = {};
      for (const [k, v] of Object.entries(patch)) {
        changes[k] = { from: def[k as keyof TypeRole], to: v };
      }
      if (Object.keys(changes).length === 0) continue;
      typeRoles.push({
        id,
        tokenName: def.tokenName,
        changes,
        note: "Typography lives in FINAL.md §Type scale and is encoded by the ui-ux 0001 DTCG token pipeline; apply there.",
      });
    }
  }

  const changeCount = colours.length + radius.length + elevation.length + surfaces.length + fontFamilies.length + typeRoles.length;

  return {
    $meta: {
      tool: "acuity design-review",
      exportedAt: new Date().toISOString(),
      scope,
      changeCount,
      instructions:
        "Apply each change to the canonical token source at docs/design/system/tokens/*.json. Colours, radius, and elevation give tokenPath directly; surfaces are composite bundles (apply per named surface archetype in the component specs / packages/ui); typography maps to FINAL.md §Typography + the ui-ux 0001 token pipeline. `from` is the current ratified value; `to` is the requested new value.",
    },
    colours,
    radius,
    elevation,
    surfaces,
    fontFamilies,
    typeRoles,
  };
}

/** Trigger a client-side download of the given data as a pretty-printed file. */
export function downloadJSON(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  triggerDownload(filename, blob);
}

function triggerDownload(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Timestamp fragment for export filenames: YYYYMMDD-HHmmss. */
export function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
