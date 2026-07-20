"use client";

// Surfaces & elements — the catalog of every card / button / control display
// style, not just the shadow. Four parts: Foundations (radius scale + the
// elevation shadow tiers, edited as tokens that propagate everywhere), then
// Cards & surfaces, Buttons, and Controls & elements — each a live demo plus an
// editable bundle (background, border width/colour/style, radius, shadow,
// padding). Demos compose from live tokens, so a foundation edit re-renders
// every surface that uses it.

import { useState } from "react";
import {
  RADIUS_TOKENS,
  ELEVATION_TIERS,
  SURFACE_GROUPS,
  SURFACE_PROPS,
  MAX_SHADOW_LAYERS,
  EMPTY_LAYER,
  layersToBoxShadow,
  type RadiusToken,
  type ElevationTier,
  type Surface,
  type ShadowLayer,
  type SurfaceProp,
} from "../_lib/tokens";
import { useReview } from "../review-state";
import {
  PageToolbar,
  RowActions,
  EditPanel,
  Field,
  TextInput,
  ComboInput,
  ColorTokenField,
} from "../_components/controls";

export default function SurfacesPage() {
  return (
    <div>
      <PageToolbar
        section="surfaces"
        title="Surfaces"
        blurb="Every card, surface, button, and control display style — background, border, radius, and shadow. Foundations (radius scale + elevation tiers) are shared tokens: edit one and every surface that references it updates live."
      />

      <section className="mb-14">
        <h2 className="text-xl text-foreground">Foundations</h2>
        <p className="mt-1 max-w-[75ch] text-sm text-muted-foreground">
          The shared radius scale and elevation shadow tiers. These are tokens — editing a value
          propagates to every surface below that uses it.
        </p>

        <h3 className="mt-6 text-base font-medium text-foreground">Radius scale</h3>
        <div className="mt-3 flex flex-col gap-3">
          {RADIUS_TOKENS.map((r) => (
            <RadiusRow key={r.id} token={r} />
          ))}
        </div>

        <h3 className="mt-8 text-base font-medium text-foreground">Elevation tiers</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          The shadow tiers. Soft elevation is selective — most surfaces are flat.
        </p>
        <div className="mt-3 flex flex-col gap-6">
          {ELEVATION_TIERS.map((tier) => (
            <ElevationRow key={tier.id} tier={tier} />
          ))}
        </div>
      </section>

      {SURFACE_GROUPS.map((group) => (
        <section key={group.id} className="mb-14">
          <h2 className="text-xl text-foreground">{group.title}</h2>
          {group.note ? <p className="mt-1 max-w-[75ch] text-sm text-muted-foreground">{group.note}</p> : null}
          <div className="mt-5 flex flex-col gap-4">
            {group.surfaces.map((s) => (
              <SurfaceRow key={s.id} surface={s} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

// ── Radius foundation row ────────────────────────────────────────────────────
// rem is the house unit (matches the component-core token source); any unit accepted.
const RADIUS_PRESETS = ["0", "0.25rem", "0.375rem", "0.5rem", "0.625rem", "0.75rem", "1rem", "1.5rem", "999px"];

function RadiusRow({ token }: { token: RadiusToken }) {
  const review = useReview();
  const value = review.radiusValue(token.cssVar, token.value);
  const dirty = review.isRadiusDirty(token.cssVar);
  return (
    <div className="flex items-center gap-4 rounded-lg border border-border px-4 py-3">
      <span
        aria-hidden
        className="size-12 shrink-0 border border-border-strong bg-muted"
        style={{ borderRadius: value }}
      />
      <div className="w-20 shrink-0">
        <span className="font-mono text-sm text-foreground">{token.name}</span>
      </div>
      <div className="w-36 shrink-0">
        <ComboInput value={value} options={RADIUS_PRESETS} onChange={(v) => review.setRadius(token.cssVar, v)} />
      </div>
      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{token.usage}</span>
      <button
        type="button"
        onClick={() => review.resetRadius(token.cssVar)}
        disabled={!dirty}
        className="no-print rounded-md border border-border bg-card px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
      >
        Reset
      </button>
    </div>
  );
}

// ── Elevation tier row (shadow layers) ───────────────────────────────────────
const layerHasValue = (l: ShadowLayer) => Boolean(l.offsetX || l.offsetY || l.blur || l.spread || l.color);

function ElevationRow({ tier }: { tier: ElevationTier }) {
  const review = useReview();
  const [editing, setEditing] = useState(false);
  const layers = review.elevationLayers(tier.id, tier.layers);
  const dirty = review.isElevationDirty(tier.id);
  const boxShadow = layersToBoxShadow(layers);
  const slots: ShadowLayer[] = [
    ...layers,
    ...Array(Math.max(0, MAX_SHADOW_LAYERS - layers.length)).fill(EMPTY_LAYER),
  ].slice(0, MAX_SHADOW_LAYERS);

  const updateLayer = (idx: number, field: keyof ShadowLayer, value: string) => {
    const next = slots.map((l, i) => (i === idx ? { ...l, [field]: value } : l));
    review.setElevation(tier.id, next.filter(layerHasValue));
  };

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-[14rem_1fr]">
      <div className="flex items-center justify-center px-3 py-6">
        <div
          className="flex h-24 w-full items-center justify-center rounded-lg bg-card"
          style={{ boxShadow: boxShadow || undefined, border: tier.id === "flat" ? "1px solid var(--caliber-border)" : undefined }}
        >
          <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{tier.name}</span>
        </div>
      </div>
      <div className="min-w-0">
        <div className="flex items-start justify-between gap-4">
          <h4 className="text-base font-medium text-foreground">{tier.title}</h4>
          <RowActions editing={editing} onToggleEdit={() => setEditing((v) => !v)} dirty={dirty} onReset={() => review.resetElevation(tier.id)} />
        </div>
        <p className="mt-1 max-w-[62ch] text-sm text-muted-foreground">{tier.usage}</p>
        <p className="mt-2 break-all rounded-md bg-muted px-3 py-2 font-mono text-xs text-foreground">{boxShadow || "none (border only)"}</p>
        {editing ? (
          <EditPanel>
            <div className="flex flex-col gap-3">
              {slots.map((layer, i) => {
                const used = layerHasValue(layer);
                return (
                  <div key={i} className={`rounded-md border p-3 ${used ? "border-border-strong bg-card" : "border-dashed border-border"}`}>
                    <div className="mb-2 flex items-center gap-2">
                      <span className="size-4 rounded border border-border" style={{ backgroundColor: layer.color || "transparent" }} />
                      <span className="text-xs font-medium text-foreground">Layer {i + 1}</span>
                      <span className="font-mono text-[10px] text-muted-foreground">{used ? "in use" : "unused"}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                      <Field label="Offset X" desc="Horizontal offset (right +)." accepts="CSS length"><TextInput value={layer.offsetX} placeholder="0rem" onChange={(v) => updateLayer(i, "offsetX", v)} /></Field>
                      <Field label="Offset Y" desc="Vertical offset (down +)." accepts="CSS length"><TextInput value={layer.offsetY} placeholder="0rem" onChange={(v) => updateLayer(i, "offsetY", v)} /></Field>
                      <Field label="Blur" desc="Blur radius." accepts="CSS length ≥ 0"><TextInput value={layer.blur} placeholder="0rem" onChange={(v) => updateLayer(i, "blur", v)} /></Field>
                      <Field label="Spread" desc="Grow/shrink." accepts="CSS length"><TextInput value={layer.spread} placeholder="0rem" onChange={(v) => updateLayer(i, "spread", v)} /></Field>
                      <Field label="Colour" desc="Low-alpha ink." accepts="any CSS colour"><TextInput value={layer.color} placeholder="rgba(10,18,42,0.06)" onChange={(v) => updateLayer(i, "color", v)} /></Field>
                    </div>
                  </div>
                );
              })}
            </div>
          </EditPanel>
        ) : null}
      </div>
    </div>
  );
}

// ── Surface row (composite style bundle) ─────────────────────────────────────
function SurfaceRow({ surface }: { surface: Surface }) {
  const review = useReview();
  const [editing, setEditing] = useState(false);
  const style = review.surfaceStyle(surface);
  const dirty = review.isSurfaceDirty(surface.id);

  return (
    <div className="rounded-lg border border-border p-5">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[16rem_1fr]">
        <div className="flex items-center justify-center rounded-lg bg-muted/40 p-6">
          <SurfaceDemo surface={surface} style={style} />
        </div>
        <div className="min-w-0">
          <div className="flex items-start justify-between gap-4">
            <h3 className="text-base font-medium text-foreground">{surface.name}</h3>
            <RowActions editing={editing} onToggleEdit={() => setEditing((v) => !v)} dirty={dirty} onReset={() => review.resetSurface(surface.id)} />
          </div>
          <p className="mt-1 max-w-[62ch] text-sm text-muted-foreground">{surface.usage}</p>
          {surface.states ? <p className="mt-1 text-xs text-venice">{surface.states}</p> : null}

          {editing ? (
            <EditPanel>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {SURFACE_PROPS.map((p) => {
                  const value = style[p.key] ?? "";
                  const set = (v: string) => review.setSurfaceProp(surface.id, p.key as SurfaceProp, v);
                  return (
                    <Field key={p.key} label={p.label} desc={p.desc} accepts={p.accepts}>
                      {p.kind === "color" ? (
                        <ColorTokenField value={value} options={p.options} onChange={set} />
                      ) : (
                        <ComboInput value={value} options={p.options} onChange={set} />
                      )}
                    </Field>
                  );
                })}
              </div>
            </EditPanel>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ── Live surface demo ────────────────────────────────────────────────────────
function bundleToCss(style: Partial<Record<SurfaceProp, string>>): React.CSSProperties {
  return {
    background: style.background,
    color: style.color,
    borderWidth: style.borderWidth,
    borderColor: style.borderColor,
    borderStyle: style.borderStyle,
    borderRadius: style.radius,
    boxShadow: style.shadow && style.shadow !== "none" ? style.shadow : undefined,
    padding: style.padding,
  };
}

function SurfaceDemo({ surface, style }: { surface: Surface; style: Partial<Record<SurfaceProp, string>> }) {
  const css = bundleToCss(style);
  switch (surface.demo) {
    case "button":
      return <div style={{ ...css, display: "inline-flex", alignItems: "center", fontSize: 14, fontWeight: 500, textDecoration: surface.id === "btn-link" ? "underline" : undefined }}>Button</div>;
    case "input":
      return (
        <div style={{ ...css, width: "100%", maxWidth: 220, fontSize: 14 }}>
          <span className="text-muted-foreground">Placeholder…</span>
        </div>
      );
    case "chip":
      return <div style={{ ...css, display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 }}>Filter <span className="text-muted-foreground">×</span></div>;
    case "badge":
      return <div style={{ ...css, display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 500 }}><span style={{ width: 6, height: 6, borderRadius: 999, background: "var(--caliber-sage)" }} />Confirmed</div>;
    case "pill":
      return <div style={{ ...css, display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 500 }}><span style={{ width: 6, height: 6, borderRadius: 999, background: "var(--caliber-sage)" }} />Active</div>;
    case "dot":
      return <div style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13 }}><span style={{ width: 8, height: 8, ...css }} />Confirmed</div>;
    case "sidebar":
      return (
        <div style={{ ...css, width: 132, height: 150, display: "flex", flexDirection: "column", gap: 6 }}>
          <span className="mb-1 px-2 font-title text-sm font-semibold text-navy">Acuity</span>
          <span style={{ background: "color-mix(in srgb, var(--caliber-sky-blue) 50%, transparent)", color: "var(--caliber-navy)", borderRadius: "0.375rem", padding: "0.35rem 0.5rem", fontSize: 12 }}>Dashboard</span>
          <span style={{ borderRadius: "0.375rem", padding: "0.35rem 0.5rem", fontSize: 12 }} className="text-muted-foreground">Clinics</span>
          <span style={{ borderRadius: "0.375rem", padding: "0.35rem 0.5rem", fontSize: 12 }} className="text-muted-foreground">Doctors</span>
        </div>
      );
    case "nav":
      return (
        <div className="flex flex-col gap-1.5">
          <span style={{ ...css, display: "inline-block", background: "color-mix(in srgb, var(--caliber-sky-blue) 50%, transparent)", color: "var(--caliber-navy)", fontSize: 13 }}>Dashboard (active)</span>
          <span style={{ ...css, display: "inline-block", fontSize: 13 }} className="text-muted-foreground">Clinics (resting)</span>
        </div>
      );
    case "row":
      return (
        <div style={{ width: "100%", maxWidth: 260 }}>
          <div style={{ ...css, display: "flex", justifyContent: "space-between", fontSize: 13 }}><span>Dr. Chan</span><span className="text-muted-foreground">Active</span></div>
          <div style={{ ...css, display: "flex", justifyContent: "space-between", fontSize: 13, background: "var(--caliber-cream-contrast)" }}><span>Dr. Wong</span><span className="text-muted-foreground">Selected</span></div>
        </div>
      );
    case "banner":
      return <div style={{ ...css, width: "100%", maxWidth: 240 }}><span className="font-title text-base font-semibold">Emphasis banner</span><p style={{ fontSize: 12, opacity: 0.85, marginTop: 4 }}>Cream text on a navy inset.</p></div>;
    case "overlay":
      return (
        <div style={{ ...css, width: "100%", maxWidth: 200, fontSize: 13 }}>
          <div style={{ padding: "0.35rem 0.5rem", borderRadius: "0.375rem" }} className="hover:bg-accent">Menu item one</div>
          <div style={{ padding: "0.35rem 0.5rem", borderRadius: "0.375rem" }} className="text-muted-foreground">Menu item two</div>
        </div>
      );
    case "card":
    default:
      return (
        <div style={{ ...css, width: "100%", maxWidth: 220 }}>
          <span className="font-title text-sm font-semibold text-foreground">{surface.name}</span>
          <p className="mt-1 text-xs text-muted-foreground">Content sits on this surface.</p>
        </div>
      );
  }
}
