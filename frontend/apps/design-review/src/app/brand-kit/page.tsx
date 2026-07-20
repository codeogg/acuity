"use client";

// The chrome-free brand-kit render, used for the PDF export. It reads the SAME
// ReviewState (client navigation keeps the provider mounted, so all in-session
// edits carry over) and lays every section out as a clean specimen document —
// no edit buttons, no sort headers, no toolbars. `?scope=` limits it to one
// section for a per-page PDF. "Save as PDF" opens the print dialog; the print
// stylesheet drops the top bar and expands the page.

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  COLOR_TIERS,
  ELEVATION_TIERS,
  RADIUS_TOKENS,
  SURFACE_GROUPS,
  SURFACE_PROPS,
  FONT_FAMILIES,
  TYPE_ROLES,
  layersToBoxShadow,
  type Surface,
  type SurfaceProp,
} from "../_lib/tokens";
import { useReview } from "../review-state";
import { ensureFont, stackToCss } from "../_lib/fonts";

const FAMILY_BY_ID = new Map(FONT_FAMILIES.map((f) => [f.id, f] as const));

export default function BrandKitPage() {
  const review = useReview();
  const [scope, setScope] = useState<string>("all");

  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get("scope");
    if (s) setScope(s);
  }, []);

  // Make sure every current face is loaded before the user prints.
  useEffect(() => {
    for (const fam of FONT_FAMILIES) ensureFont(review.familyStack(fam.id, fam.stack)[0] ?? "");
  }, [review]);

  const show = (s: string) => scope === "all" || scope === s;
  const label = scope === "all" ? "complete brand kit" : `${scope} specification`;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="no-print mb-8 flex items-center justify-between rounded-lg border border-border bg-card p-3 shadow-[var(--elevation-raised)]">
        <span className="text-sm text-muted-foreground">
          Print-ready render. Use your browser&apos;s <span className="font-medium text-foreground">Save as PDF</span> (edit chrome is hidden in print).
        </span>
        <div className="flex items-center gap-2">
          <Link
            href="/colours"
            className="rounded-md border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Back to editor
          </Link>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-md border border-navy bg-navy px-3 py-1.5 text-sm text-cream transition-colors hover:bg-[var(--caliber-navy-bright)]"
          >
            Save as PDF
          </button>
        </div>
      </div>

      <header className="mb-10 border-b border-border-strong pb-6">
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Acuity · {label}</p>
        <h1 className="mt-2 font-title text-4xl font-semibold text-navy">Acuity brand kit</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Generated {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
          {review.totalDirtyCount > 0 ? ` · includes ${review.totalDirtyCount} in-session change(s)` : " · ratified values"}.
        </p>
      </header>

      {show("colours") ? <ColoursKit /> : null}
      {show("surfaces") ? <SurfacesKit /> : null}
      {show("fonts") ? <FontsKit /> : null}
    </div>
  );
}

function ColoursKit() {
  const review = useReview();
  return (
    <section className="mb-12">
      <h2 className="mb-4 font-title text-2xl font-semibold text-foreground">Colour</h2>
      <div className="flex flex-col gap-8">
        {COLOR_TIERS.map((tier) => (
          <div key={tier.id}>
            <h3 className="text-lg text-foreground">{tier.title}</h3>
            <div className="mt-3 overflow-hidden rounded-lg border border-border">
              <div className="grid grid-cols-[2.25rem_10rem_6rem_10rem_1fr] items-center gap-4 border-b border-border-strong bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground">
                <span aria-hidden />
                <span>Name</span>
                <span>Hex</span>
                <span>Category</span>
                <span>Used for</span>
              </div>
              {tier.entries.map((e, i) => {
                const value = review.colorValue(e.cssVar, e.hex);
                return (
                  <div
                    key={`${e.id}-${i}`}
                    className={`grid grid-cols-[2.25rem_10rem_6rem_10rem_1fr] items-center gap-4 px-4 py-2 ${i > 0 ? "border-t border-border" : ""}`}
                  >
                    <span className="size-7 rounded-md border border-border" style={{ backgroundColor: value }} />
                    <span className="truncate text-sm font-medium text-foreground">{e.name}</span>
                    <span className="font-mono text-xs uppercase text-venice">{value}</span>
                    <span className="truncate text-xs text-muted-foreground">{e.category}</span>
                    <span className="truncate text-xs text-muted-foreground">{e.usage}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function kitBundle(style: Partial<Record<SurfaceProp, string>>): React.CSSProperties {
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

function SurfacesKit() {
  const review = useReview();
  return (
    <section className="mb-12">
      <h2 className="mb-4 font-title text-2xl font-semibold text-foreground">Surfaces</h2>

      <h3 className="text-lg text-foreground">Radius scale</h3>
      <div className="mt-3 flex flex-wrap gap-6">
        {RADIUS_TOKENS.map((r) => {
          const v = review.radiusValue(r.cssVar, r.value);
          return (
            <div key={r.id} className="flex items-center gap-3">
              <span className="size-12 border border-border-strong bg-muted" style={{ borderRadius: v }} />
              <div>
                <p className="font-mono text-sm text-foreground">{r.name}</p>
                <p className="font-mono text-[10px] text-muted-foreground">{v}</p>
              </div>
            </div>
          );
        })}
      </div>

      <h3 className="mt-8 text-lg text-foreground">Elevation tiers</h3>
      <div className="mt-3 grid grid-cols-1 gap-5 sm:grid-cols-2">
        {ELEVATION_TIERS.map((tier) => {
          const boxShadow = layersToBoxShadow(review.elevationLayers(tier.id, tier.layers));
          return (
            <div key={tier.id} className="rounded-lg p-4">
              <div className="flex h-20 items-center justify-center rounded-lg bg-card" style={{ boxShadow: boxShadow || undefined, border: tier.id === "flat" ? "1px solid var(--caliber-border)" : undefined }}>
                <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{tier.name}</span>
              </div>
              <p className="mt-2 break-all font-mono text-[10px] text-muted-foreground">{tier.title} — {boxShadow || "none"}</p>
            </div>
          );
        })}
      </div>

      {SURFACE_GROUPS.map((group) => (
        <div key={group.id}>
          <h3 className="mt-8 text-lg text-foreground">{group.title}</h3>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {group.surfaces.map((s) => (
              <KitSurface key={s.id} surface={s} />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

function KitSurface({ surface }: { surface: Surface }) {
  const review = useReview();
  const style = review.surfaceStyle(surface);
  const props = SURFACE_PROPS.filter((p) => style[p.key]).map((p) => `${p.label}: ${style[p.key]}`);
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex min-h-16 items-center justify-center rounded-md bg-muted/40 p-3">
        <div style={{ ...kitBundle(style), fontSize: 12, minWidth: 60, textAlign: "center" }}>{surface.name}</div>
      </div>
      <p className="mt-2 text-xs font-medium text-foreground">{surface.name}</p>
      <p className="mt-0.5 font-mono text-[9px] leading-snug text-muted-foreground">{props.join(" · ")}</p>
    </div>
  );
}

function FontsKit() {
  const review = useReview();
  return (
    <section className="mb-12">
      <h2 className="mb-4 font-title text-2xl font-semibold text-foreground">Typography</h2>

      <h3 className="text-lg text-foreground">Font families</h3>
      <div className="mt-3 flex flex-col gap-4">
        {FONT_FAMILIES.map((fam) => {
          const stack = review.familyStack(fam.id, fam.stack);
          return (
            <div key={fam.id} className="rounded-lg border border-border p-4">
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-medium text-foreground">{fam.label}</span>
                <span className="font-mono text-xs text-venice">{stack[0]}</span>
              </div>
              <p
                className="mt-2 text-xl text-foreground"
                style={{ fontFamily: stackToCss(stack), fontWeight: fam.id.startsWith("title") ? 600 : 400 }}
              >
                {fam.script === "cjk" ? "銳見 · 臨床清晰 Acuity 0123" : "Acuity — clarity in clinical practice 0123"}
              </p>
              <p className="mt-1 font-mono text-[10px] text-muted-foreground">{stackToCss(stack)}</p>
            </div>
          );
        })}
      </div>

      <h3 className="mt-8 text-lg text-foreground">Type scale</h3>
      <div className="mt-3 flex flex-col gap-4">
        {TYPE_ROLES.map((def) => {
          const role = review.typeRole(def);
          const stack = review.familyStack(role.family, FAMILY_BY_ID.get(role.family)?.stack ?? []);
          return (
            <div key={def.id} className="border-b border-border pb-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium text-foreground">{role.label}</span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {role.sizePx}px · {role.weight} · lh {role.lineHeight} · ls {role.letterSpacing} · {stack[0]}
                </span>
              </div>
              <span
                className="mt-1 block overflow-x-auto whitespace-nowrap py-1 text-foreground"
                style={{
                  fontFamily: stackToCss(stack),
                  fontSize: `${role.sizePx}px`,
                  lineHeight: role.lineHeight,
                  fontWeight: role.weight,
                  letterSpacing: role.letterSpacing,
                  wordSpacing: role.wordSpacing,
                  textTransform: role.textTransform as React.CSSProperties["textTransform"],
                  fontStyle: role.fontStyle,
                  fontVariationSettings: role.variationSettings,
                  fontFeatureSettings: role.featureSettings,
                }}
              >
                {role.sample}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
