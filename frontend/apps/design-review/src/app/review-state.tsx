"use client";

// The editing layer for the whole harness. Holds every override (colours,
// elevation, font families, type roles) in memory, tracks which items differ
// from their ratified default, and exposes per-item / per-section / global
// reset. Edits live for the session and across section switches (client-side
// navigation keeps this provider mounted) but are lost on reload — so a
// beforeunload guard warns when there are unexported changes. Pages render
// their swatches/demos/previews straight from this state, so every edit is
// reflected immediately.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
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
  type Surface,
  type SurfaceProp,
} from "./_lib/tokens";
import { readLiveColor, readLiveShadow } from "./_lib/live";

export type Section = "colours" | "surfaces" | "fonts";

type TypePatch = Partial<Omit<TypeRole, "id" | "label" | "role" | "sample" | "tokenName">>;
type SurfacePatch = Partial<Record<SurfaceProp, string>>;

type ReviewContextValue = {
  // Colours — cssVar → hex. `colorBase` is the live/ratified baseline (before edits).
  colorValue: (cssVar: string, def: string) => string;
  colorBase: (cssVar: string, def: string) => string;
  setColor: (cssVar: string, hex: string) => void;
  resetColor: (cssVar: string) => void;
  isColorDirty: (cssVar: string) => boolean;

  // Elevation — tierId → layers. `elevationBase` is the live/ratified baseline.
  elevationLayers: (tierId: string, def: ShadowLayer[]) => ShadowLayer[];
  elevationBase: (tierId: string, def: ShadowLayer[]) => ShadowLayer[];
  setElevation: (tierId: string, layers: ShadowLayer[]) => void;
  resetElevation: (tierId: string) => void;
  isElevationDirty: (tierId: string) => boolean;

  // Radius foundations — cssVar → length value (live baseline).
  radiusValue: (cssVar: string, def: string) => string;
  radiusBase: (cssVar: string, def: string) => string;
  setRadius: (cssVar: string, v: string) => void;
  resetRadius: (cssVar: string) => void;
  isRadiusDirty: (cssVar: string) => boolean;

  // Surface styles — surfaceId → merged style bundle.
  surfaceStyle: (s: Surface) => Partial<Record<SurfaceProp, string>>;
  setSurfaceProp: (id: string, prop: SurfaceProp, value: string) => void;
  resetSurface: (id: string) => void;
  isSurfaceDirty: (id: string) => boolean;

  // Font families — id → stack
  familyStack: (id: string, def: string[]) => string[];
  setFamily: (id: string, stack: string[]) => void;
  resetFamily: (id: string) => void;
  isFamilyDirty: (id: string) => boolean;

  // Type roles — id → merged role
  typeRole: (def: TypeRole) => TypeRole;
  setTypeField: (id: string, patch: TypePatch) => void;
  resetType: (id: string) => void;
  isTypeDirty: (id: string) => boolean;

  // Dirty accounting + reset
  sectionDirtyCount: (section: Section) => number;
  totalDirtyCount: number;
  resetSection: (section: Section) => void;
  resetAll: () => void;

  // Raw override maps + live baselines (for export assembly)
  colorOverrides: Record<string, string>;
  elevationOverrides: Record<string, ShadowLayer[]>;
  familyOverrides: Record<string, string[]>;
  typeOverrides: Record<string, TypePatch>;
  radiusOverrides: Record<string, string>;
  surfaceOverrides: Record<string, SurfacePatch>;
  liveColor: Record<string, string>;
  liveElevation: Record<string, ShadowLayer[]>;
  liveRadius: Record<string, string>;
};

const ReviewContext = createContext<ReviewContextValue | null>(null);

// Default lookups, resolved once from the data module.
const COLOR_DEFAULT = new Map<string, string>();
for (const tier of COLOR_TIERS) for (const e of tier.entries) COLOR_DEFAULT.set(e.cssVar, e.hex);
// Alias graph: a token colour → the css var it references (token tiers only).
// Used so an aliased row's displayed value follows edits to its source token.
const COLOR_REF = new Map<string, string>();
for (const tier of COLOR_TIERS) for (const e of tier.entries) if (e.ref) COLOR_REF.set(e.cssVar, e.ref);
const ELEVATION_DEFAULT = new Map<string, ShadowLayer[]>();
for (const t of ELEVATION_TIERS) ELEVATION_DEFAULT.set(t.id, t.layers);
const FAMILY_DEFAULT = new Map<string, string[]>();
for (const f of FONT_FAMILIES) FAMILY_DEFAULT.set(f.id, f.stack);
const TYPE_DEFAULT = new Map<string, TypeRole>();
for (const r of TYPE_ROLES) TYPE_DEFAULT.set(r.id, r);
const RADIUS_DEFAULT = new Map<string, string>();
for (const r of RADIUS_TOKENS) RADIUS_DEFAULT.set(r.cssVar, r.value);
const SURFACE_DEFAULT = new Map<string, Partial<Record<SurfaceProp, string>>>();
for (const g of SURFACE_GROUPS) for (const s of g.surfaces) SURFACE_DEFAULT.set(s.id, s.style);

const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function ReviewProvider({ children }: { children: ReactNode }) {
  const [colorOverrides, setColorOverrides] = useState<Record<string, string>>({});
  const [elevationOverrides, setElevationOverrides] = useState<Record<string, ShadowLayer[]>>({});
  const [familyOverrides, setFamilyOverrides] = useState<Record<string, string[]>>({});
  const [typeOverrides, setTypeOverrides] = useState<Record<string, TypePatch>>({});
  const [radiusOverrides, setRadiusOverrides] = useState<Record<string, string>>({});
  const [surfaceOverrides, setSurfaceOverrides] = useState<Record<string, SurfacePatch>>({});

  // Live token values read from the loaded stylesheet at mount — the real
  // deployed baseline. Seed values (COLOR_DEFAULT / ELEVATION_DEFAULT) are the
  // structural fallback when a token is not present in this app's CSS.
  const [liveColor, setLiveColor] = useState<Record<string, string>>({});
  const [liveElevation, setLiveElevation] = useState<Record<string, ShadowLayer[]>>({});
  const [liveRadius, setLiveRadius] = useState<Record<string, string>>({});
  const [liveFamily, setLiveFamily] = useState<Record<string, string[]>>({});

  useEffect(() => {
    const probe = document.createElement("div");
    probe.style.display = "none";
    document.body.appendChild(probe);
    const colors: Record<string, string> = {};
    for (const [cssVar] of COLOR_DEFAULT) {
      const live = readLiveColor(probe, cssVar);
      if (live) colors[cssVar] = live;
    }
    probe.remove();
    const shadows: Record<string, ShadowLayer[]> = {};
    for (const tier of ELEVATION_TIERS) {
      if (!tier.cssVar) continue;
      const live = readLiveShadow(tier.cssVar);
      if (live) shadows[tier.id] = live;
    }
    const root = getComputedStyle(document.documentElement);
    const radii: Record<string, string> = {};
    for (const [cssVar] of RADIUS_DEFAULT) {
      // Show the component-core token value verbatim (rem), unconverted.
      const v = root.getPropertyValue(cssVar).trim();
      if (v) radii[cssVar] = v;
    }
    // Font families: read the real --font-family-* stacks from the theme.
    const fams: Record<string, string[]> = {};
    for (const fam of FONT_FAMILIES) {
      const raw = root.getPropertyValue(fam.cssVar).trim();
      if (raw) fams[fam.id] = raw.split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
    }
    setLiveColor(colors);
    setLiveElevation(shadows);
    setLiveRadius(radii);
    setLiveFamily(fams);
  }, []);

  const colorBaseline = useCallback(
    (cssVar: string, def: string) => liveColor[cssVar] ?? COLOR_DEFAULT.get(cssVar) ?? def,
    [liveColor],
  );

  // ── Colours ──
  // Resolve a colour var to its live value, following alias refs through the
  // override map: an override on any var in the chain wins, so an aliased token
  // (e.g. --border → --caliber-border) reflects an edit to its source. Falls
  // back to the mount-read live baseline, then the seed default.
  const resolveColor = useCallback(
    (cssVar: string, def?: string): string => {
      const seen = new Set<string>();
      let cur = cssVar;
      while (!seen.has(cur)) {
        seen.add(cur);
        const override = colorOverrides[cur];
        if (override !== undefined) return override;
        const ref = COLOR_REF.get(cur);
        if (!ref) break;
        cur = ref;
      }
      return (
        liveColor[cur] ??
        COLOR_DEFAULT.get(cur) ??
        liveColor[cssVar] ??
        COLOR_DEFAULT.get(cssVar) ??
        def ??
        ""
      );
    },
    [colorOverrides, liveColor],
  );
  const colorValue = useCallback(
    (cssVar: string, def: string) => resolveColor(cssVar, def),
    [resolveColor],
  );
  const colorBase = colorBaseline;
  const setColor = useCallback(
    (cssVar: string, hex: string) => {
      setColorOverrides((prev) => {
        if (hex === (liveColor[cssVar] ?? COLOR_DEFAULT.get(cssVar))) {
          const rest = { ...prev };
          delete rest[cssVar];
          return rest;
        }
        return { ...prev, [cssVar]: hex };
      });
    },
    [liveColor],
  );
  const resetColor = useCallback((cssVar: string) => {
    setColorOverrides((prev) => {
      const rest = { ...prev };
      delete rest[cssVar];
      return rest;
    });
  }, []);
  const isColorDirty = useCallback(
    (cssVar: string) => cssVar in colorOverrides && colorOverrides[cssVar] !== (liveColor[cssVar] ?? COLOR_DEFAULT.get(cssVar)),
    [colorOverrides, liveColor],
  );

  // ── Elevation ──
  const elevationBaseline = useCallback(
    (tierId: string, def: ShadowLayer[]) => liveElevation[tierId] ?? ELEVATION_DEFAULT.get(tierId) ?? def,
    [liveElevation],
  );
  const elevationLayers = useCallback(
    (tierId: string, def: ShadowLayer[]) => elevationOverrides[tierId] ?? elevationBaseline(tierId, def),
    [elevationOverrides, elevationBaseline],
  );
  const elevationBase = elevationBaseline;
  const setElevation = useCallback(
    (tierId: string, layers: ShadowLayer[]) => {
      setElevationOverrides((prev) => {
        if (eq(layers, liveElevation[tierId] ?? ELEVATION_DEFAULT.get(tierId))) {
          const rest = { ...prev };
          delete rest[tierId];
          return rest;
        }
        return { ...prev, [tierId]: layers };
      });
    },
    [liveElevation],
  );
  const resetElevation = useCallback((tierId: string) => {
    setElevationOverrides((prev) => {
      const rest = { ...prev };
      delete rest[tierId];
      return rest;
    });
  }, []);
  const isElevationDirty = useCallback((tierId: string) => tierId in elevationOverrides, [elevationOverrides]);

  // ── Radius foundations ──
  const radiusBase = useCallback(
    (cssVar: string, def: string) => liveRadius[cssVar] ?? RADIUS_DEFAULT.get(cssVar) ?? def,
    [liveRadius],
  );
  const radiusValue = useCallback(
    (cssVar: string, def: string) => radiusOverrides[cssVar] ?? radiusBase(cssVar, def),
    [radiusOverrides, radiusBase],
  );
  const setRadius = useCallback(
    (cssVar: string, v: string) => {
      setRadiusOverrides((prev) => {
        if (v === (liveRadius[cssVar] ?? RADIUS_DEFAULT.get(cssVar))) {
          const rest = { ...prev };
          delete rest[cssVar];
          return rest;
        }
        return { ...prev, [cssVar]: v };
      });
    },
    [liveRadius],
  );
  const resetRadius = useCallback((cssVar: string) => {
    setRadiusOverrides((prev) => {
      const rest = { ...prev };
      delete rest[cssVar];
      return rest;
    });
  }, []);
  const isRadiusDirty = useCallback(
    (cssVar: string) => cssVar in radiusOverrides && radiusOverrides[cssVar] !== (liveRadius[cssVar] ?? RADIUS_DEFAULT.get(cssVar)),
    [radiusOverrides, liveRadius],
  );

  // ── Surface styles ──
  const surfaceStyle = useCallback(
    (s: Surface) => ({ ...s.style, ...(surfaceOverrides[s.id] ?? {}) }),
    [surfaceOverrides],
  );
  const setSurfaceProp = useCallback((id: string, prop: SurfaceProp, value: string) => {
    setSurfaceOverrides((prev) => {
      const def = SURFACE_DEFAULT.get(id) ?? {};
      const merged = { ...(prev[id] ?? {}), [prop]: value };
      const trimmed: SurfacePatch = {};
      for (const [k, v] of Object.entries(merged)) {
        if (v !== (def[k as SurfaceProp] ?? "")) (trimmed as Record<string, string>)[k] = v;
      }
      if (Object.keys(trimmed).length === 0) {
        const rest = { ...prev };
        delete rest[id];
        return rest;
      }
      return { ...prev, [id]: trimmed };
    });
  }, []);
  const resetSurface = useCallback((id: string) => {
    setSurfaceOverrides((prev) => {
      const rest = { ...prev };
      delete rest[id];
      return rest;
    });
  }, []);
  const isSurfaceDirty = useCallback((id: string) => id in surfaceOverrides, [surfaceOverrides]);

  // ── Font families ── (baseline = live theme stack ?? seed)
  const familyStack = useCallback(
    (id: string, def: string[]) => familyOverrides[id] ?? liveFamily[id] ?? def,
    [familyOverrides, liveFamily],
  );
  const setFamily = useCallback(
    (id: string, stack: string[]) => {
      setFamilyOverrides((prev) => {
        if (eq(stack, liveFamily[id] ?? FAMILY_DEFAULT.get(id))) {
          const rest = { ...prev };
          delete rest[id];
          return rest;
        }
        return { ...prev, [id]: stack };
      });
    },
    [liveFamily],
  );
  const resetFamily = useCallback((id: string) => {
    setFamilyOverrides((prev) => {
      const rest = { ...prev };
      delete rest[id];
      return rest;
    });
  }, []);
  const isFamilyDirty = useCallback(
    (id: string) => id in familyOverrides && !eq(familyOverrides[id], liveFamily[id] ?? FAMILY_DEFAULT.get(id)),
    [familyOverrides, liveFamily],
  );

  // ── Type roles ──
  const typeRole = useCallback(
    (def: TypeRole): TypeRole => ({ ...def, ...(typeOverrides[def.id] ?? {}) }),
    [typeOverrides],
  );
  const setTypeField = useCallback((id: string, patch: TypePatch) => {
    setTypeOverrides((prev) => {
      const merged = { ...(prev[id] ?? {}), ...patch };
      const def = TYPE_DEFAULT.get(id)!;
      // Drop fields that match the default; if nothing differs, drop the entry.
      const trimmed: TypePatch = {};
      for (const [k, v] of Object.entries(merged)) {
        if (!eq(v, def[k as keyof TypeRole])) (trimmed as Record<string, unknown>)[k] = v;
      }
      if (Object.keys(trimmed).length === 0) {
        const rest = { ...prev };
        delete rest[id];
        return rest;
      }
      return { ...prev, [id]: trimmed };
    });
  }, []);
  const resetType = useCallback((id: string) => {
    setTypeOverrides((prev) => {
      const rest = { ...prev };
      delete rest[id];
      return rest;
    });
  }, []);
  const isTypeDirty = useCallback((id: string) => id in typeOverrides, [typeOverrides]);

  // ── Dirty accounting ──
  const colorDirty = useMemo(
    () => Object.keys(colorOverrides).filter((k) => colorOverrides[k] !== (liveColor[k] ?? COLOR_DEFAULT.get(k))).length,
    [colorOverrides, liveColor],
  );
  const elevationDirty = Object.keys(elevationOverrides).length;
  const familyDirty = Object.keys(familyOverrides).length;
  const typeDirty = Object.keys(typeOverrides).length;
  const radiusDirty = useMemo(
    () => Object.keys(radiusOverrides).filter((k) => radiusOverrides[k] !== (liveRadius[k] ?? RADIUS_DEFAULT.get(k))).length,
    [radiusOverrides, liveRadius],
  );
  const surfaceDirty = Object.keys(surfaceOverrides).length;
  // The Surfaces section owns radius foundations, elevation tiers, and surfaces.
  const surfacesDirty = elevationDirty + radiusDirty + surfaceDirty;

  const sectionDirtyCount = useCallback(
    (section: Section) => {
      if (section === "colours") return colorDirty;
      if (section === "surfaces") return surfacesDirty;
      return familyDirty + typeDirty;
    },
    [colorDirty, surfacesDirty, familyDirty, typeDirty],
  );
  const totalDirtyCount = colorDirty + surfacesDirty + familyDirty + typeDirty;

  const resetSection = useCallback((section: Section) => {
    if (section === "colours") setColorOverrides({});
    else if (section === "surfaces") {
      setElevationOverrides({});
      setRadiusOverrides({});
      setSurfaceOverrides({});
    } else {
      setFamilyOverrides({});
      setTypeOverrides({});
    }
  }, []);
  const resetAll = useCallback(() => {
    setColorOverrides({});
    setElevationOverrides({});
    setFamilyOverrides({});
    setTypeOverrides({});
    setRadiusOverrides({});
    setSurfaceOverrides({});
  }, []);

  // Apply colour / radius / elevation overrides as CSS custom properties on a
  // wrapper, so surface demos (which reference var(--…)) reflect foundation
  // edits live and propagate across every surface that uses the token.
  const cssVarStyle = useMemo(() => {
    const style: Record<string, string> = {};
    for (const [k, v] of Object.entries(colorOverrides)) style[k] = v;
    for (const [k, v] of Object.entries(radiusOverrides)) style[k] = v;
    for (const [tierId, layers] of Object.entries(elevationOverrides)) {
      const tier = ELEVATION_TIERS.find((t) => t.id === tierId);
      if (tier?.cssVar) style[tier.cssVar] = layersToBoxShadow(layers) || "none";
    }
    return style as React.CSSProperties;
  }, [colorOverrides, radiusOverrides, elevationOverrides]);

  // Warn before a reload/close discards unexported edits.
  useEffect(() => {
    if (totalDirtyCount === 0) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [totalDirtyCount]);

  const value: ReviewContextValue = {
    colorValue, colorBase, setColor, resetColor, isColorDirty,
    elevationLayers, elevationBase, setElevation, resetElevation, isElevationDirty,
    radiusValue, radiusBase, setRadius, resetRadius, isRadiusDirty,
    surfaceStyle, setSurfaceProp, resetSurface, isSurfaceDirty,
    familyStack, setFamily, resetFamily, isFamilyDirty,
    typeRole, setTypeField, resetType, isTypeDirty,
    sectionDirtyCount, totalDirtyCount, resetSection, resetAll,
    colorOverrides, elevationOverrides, familyOverrides, typeOverrides,
    radiusOverrides, surfaceOverrides,
    liveColor, liveElevation, liveRadius,
  };

  return (
    <ReviewContext.Provider value={value}>
      <div style={cssVarStyle}>{children}</div>
    </ReviewContext.Provider>
  );
}

export function useReview() {
  const ctx = useContext(ReviewContext);
  if (!ctx) throw new Error("useReview must be used within ReviewProvider");
  return ctx;
}
