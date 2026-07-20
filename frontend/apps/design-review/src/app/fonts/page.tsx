"use client";

// Comprehensive type editor. Two parts:
//   1. Font families — the five family definitions. Each shows a live specimen
//      and an edit panel with a family PICKER (every option previewed in its own
//      face, loaded from Google Fonts on demand) plus the raw fallback stack.
//   2. Type roles — display → eyebrow, each a live specimen rendered with EVERY
//      typographic parameter, and an edit panel exposing all of them: family
//      slot, size, line-height, weight, letter-spacing, word-spacing, transform,
//      style, and the variable-axis / OpenType-feature settings ("compression /
//      spacing"). Every edit re-renders the specimen immediately.

import { useEffect, useMemo, useState } from "react";
import {
  FONT_FAMILIES,
  FONT_LIBRARY,
  TYPE_ROLES,
  VARIABLE_AXES,
  type FontFamilyDef,
  type FontOption,
  type TypeRole,
} from "../_lib/tokens";
import { useReview } from "../review-state";
import { ensureFont, stackToCss, categoryFallback } from "../_lib/fonts";
import {
  PageToolbar,
  RowActions,
  EditPanel,
  Field,
  TextInput,
  SelectInput,
  ComboInput,
  InfoTip,
} from "../_components/controls";

const FAMILY_BY_ID = new Map(FONT_FAMILIES.map((f) => [f.id, f] as const));

// Which picker categories are relevant to each family slot's script.
const PICKER_CATEGORIES: Record<string, string[]> = {
  latin: ["serif", "sans", "display"],
  mono: ["mono"],
  cjk: ["cjk"],
};

export default function FontsPage() {
  return (
    <div>
      <PageToolbar
        section="fonts"
        title="Fonts"
        blurb="The full type system: five font families and nine type roles. Pick any Google Font (previewed live), then tune every parameter of every role — size, weight, tracking, line-height, and the variable-axis / OpenType settings. Edits re-render the specimens immediately."
      />

      <section className="mb-14">
        <h2 className="text-xl text-foreground">Font families</h2>
        <p className="mt-1 max-w-[75ch] text-sm text-muted-foreground">
          The primary face plus fallback stack for each script/role. Change the primary from the
          picker; every type role set in that family follows.
        </p>
        <div className="mt-5 flex flex-col gap-4">
          {FONT_FAMILIES.map((fam) => (
            <FamilyRow key={fam.id} fam={fam} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-xl text-foreground">Type roles</h2>
        <p className="mt-1 max-w-[75ch] text-sm text-muted-foreground">
          Every type variation, rendered at its real values. Each exposes every parameter that can
          be set on it.
        </p>
        <div className="mt-5 flex flex-col gap-4">
          {TYPE_ROLES.map((role) => (
            <TypeRoleRow key={role.id} role={role} />
          ))}
        </div>
      </section>
    </div>
  );
}

// ── Font family row ──────────────────────────────────────────────────────────
function FamilyRow({ fam }: { fam: FontFamilyDef }) {
  const review = useReview();
  const [editing, setEditing] = useState(false);
  const stack = review.familyStack(fam.id, fam.stack);
  const dirty = review.isFamilyDirty(fam.id);
  const primary = stack[0] ?? "";

  useEffect(() => {
    ensureFont(primary);
  }, [primary]);

  const setPrimary = (family: string) => {
    ensureFont(family);
    review.setFamily(fam.id, [family, ...stack.slice(1)]);
  };
  const setStack = (raw: string) => {
    const next = raw.split(",").map((s) => s.trim()).filter(Boolean);
    if (next[0]) ensureFont(next[0]);
    review.setFamily(fam.id, next.length ? next : fam.stack);
  };

  return (
    <div className="rounded-lg border border-border p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <h3 className="text-base font-medium text-foreground">{fam.label}</h3>
            <span className="font-mono text-xs text-venice">{primary}</span>
          </div>
          <p className="mt-1 max-w-[62ch] text-xs text-muted-foreground">{fam.role}</p>
        </div>
        <RowActions
          editing={editing}
          onToggleEdit={() => setEditing((v) => !v)}
          dirty={dirty}
          onReset={() => review.resetFamily(fam.id)}
        />
      </div>

      <p
        className="mt-4 text-2xl text-foreground"
        style={{ fontFamily: stackToCss(stack), fontWeight: fam.id === "title" || fam.id === "title-tc" ? 600 : 400 }}
      >
        {fam.script === "cjk" ? "銳見 · 臨床清晰 Acuity 0123" : "Acuity — clarity in clinical practice 0123"}
      </p>

      {editing ? (
        <EditPanel>
          <FamilyPicker
            current={primary}
            onPick={setPrimary}
            allow={PICKER_CATEGORIES[fam.script] ?? ["serif", "sans", "display", "mono", "cjk"]}
          />
          <div className="mt-4">
            <Field
              label="Full stack"
              hint="comma-separated, first = primary"
              desc="The font-family stack: the primary face plus ordered fallbacks used until it loads."
              accepts="comma-separated family names / generics (serif, sans-serif, monospace)"
            >
              <TextInput value={stack.join(", ")} onChange={setStack} />
            </Field>
          </div>
        </EditPanel>
      ) : null}
    </div>
  );
}

function FamilyPicker({ current, onPick, allow }: { current: string; onPick: (f: string) => void; allow: string[] }) {
  const [custom, setCustom] = useState("");
  // Only faces relevant to this slot (title/body → text faces, mono → mono,
  // cjk → cjk); a mono slot never lists serifs, a title slot never lists mono.
  const shown = useMemo(() => FONT_LIBRARY.filter((o) => allow.includes(o.category)), [allow]);
  // Load each shown option's face once the picker opens, so each previews in itself.
  useEffect(() => {
    for (const opt of shown) ensureFont(opt.family);
  }, [shown]);

  const groups = useMemo(() => {
    const by: Record<string, FontOption[]> = {};
    for (const o of shown) (by[o.category] ??= []).push(o);
    return by;
  }, [shown]);

  const order: { key: string; label: string }[] = [
    { key: "serif", label: "Serif" },
    { key: "sans", label: "Sans" },
    { key: "display", label: "Display" },
    { key: "mono", label: "Mono" },
    { key: "cjk", label: "CJK" },
  ].filter((o) => allow.includes(o.key));

  const addCustom = () => {
    const name = custom.trim();
    if (!name) return;
    onPick(name);
    setCustom("");
  };

  return (
    <div>
      <div className="mb-3 flex items-end gap-2">
        <Field label="Any Google Font" hint="type a family name">
          <TextInput value={custom} mono={false} onChange={setCustom} placeholder="e.g. Cardo" />
        </Field>
        <button
          type="button"
          onClick={addCustom}
          className="mb-0 h-9 shrink-0 rounded-md border border-navy bg-navy px-3 text-sm text-cream transition-colors hover:bg-[var(--caliber-navy-bright)]"
        >
          Use
        </button>
      </div>
      <div className="flex flex-col gap-4">
        {order.map(({ key, label }) =>
          groups[key] ? (
            <div key={key}>
              <p className="mb-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {groups[key].map((opt) => {
                  const active = opt.family === current;
                  return (
                    <button
                      key={opt.family}
                      type="button"
                      onClick={() => onPick(opt.family)}
                      className={`flex flex-col items-start gap-1 rounded-md border px-3 py-2 text-left transition-colors ${
                        active
                          ? "border-navy bg-sky-blue/40"
                          : "border-border bg-card hover:bg-accent"
                      }`}
                    >
                      <span className="font-mono text-[10px] text-muted-foreground">{opt.family}</span>
                      <span
                        className="text-lg leading-tight text-foreground"
                        style={{ fontFamily: `"${opt.family}", ${categoryFallback(opt.category)}` }}
                      >
                        Ag Acuity
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null,
        )}
      </div>
    </div>
  );
}

// ── Type role row ────────────────────────────────────────────────────────────
const TRANSFORM_OPTS = ["none", "uppercase", "lowercase", "capitalize"].map((v) => ({ value: v, label: v }));
const STYLE_OPTS = ["normal", "italic", "oblique"].map((v) => ({ value: v, label: v }));
const SLOT_OPTS = [
  { value: "title", label: "title (Fraunces)" },
  { value: "body", label: "body (sans)" },
  { value: "mono", label: "mono (IBM Plex Mono)" },
];
const SIZE_PRESETS = ["12", "14", "16", "20", "24", "31", "39", "49", "61"];
const LINE_HEIGHT_PRESETS = ["1", "1.05", "1.1", "1.15", "1.2", "1.4", "1.5", "1.55", "1.6"];
const WEIGHT_PRESETS = ["300", "400", "500", "600", "700"];
const LETTER_SPACING_PRESETS = ["normal", "0", "-0.02em", "-0.015em", "-0.01em", "-0.005em", "0.01em", "0.08em"];
const WORD_SPACING_PRESETS = ["normal", "0", "0.1em", "0.2em"];

// Common OpenType features for the feature-settings checklist.
const FEATURES: { tag: string; label: string }[] = [
  { tag: "liga", label: "Ligatures" },
  { tag: "dlig", label: "Discretionary ligatures" },
  { tag: "tnum", label: "Tabular numerals" },
  { tag: "onum", label: "Old-style numerals" },
  { tag: "lnum", label: "Lining numerals" },
  { tag: "smcp", label: "Small caps" },
  { tag: "ss01", label: "Stylistic set 1" },
  { tag: "kern", label: "Kerning" },
  { tag: "calt", label: "Contextual alternates" },
  { tag: "frac", label: "Fractions" },
  { tag: "zero", label: "Slashed zero" },
];

const featureOn = (value: string, tag: string) => new RegExp(`["']${tag}["']\\s+1`).test(value);
function toggleFeature(value: string, tag: string): string {
  const parts = value && value !== "normal" ? value.split(",").map((s) => s.trim()).filter(Boolean) : [];
  const has = featureOn(value, tag);
  const next = has
    ? parts.filter((p) => !new RegExp(`["']${tag}["']`).test(p))
    : [...parts, `"${tag}" 1`];
  return next.length ? next.join(", ") : "normal";
}

function parseAxes(value: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of value.matchAll(/["'](\w+)["']\s+([\d.]+)/g)) {
    if (m[1]) out[m[1]] = Number(m[2]);
  }
  return out;
}

function AxisControls({ face, value, onChange }: { face: string; value: string; onChange: (v: string) => void }) {
  const axes = VARIABLE_AXES[face];
  if (!axes) {
    return <ComboInput value={value} options={["normal"]} onChange={onChange} placeholder='"wght" 400' />;
  }
  const current = parseAxes(value);
  const setAxis = (tag: string, v: number) => {
    const map = { ...current, [tag]: v };
    onChange(axes.map((a) => `"${a.tag}" ${map[a.tag] ?? a.default}`).join(", "));
  };
  return (
    <div className="flex flex-col gap-2">
      {axes.map((a) => {
        const val = current[a.tag] ?? a.default;
        return (
          <div key={a.tag} className="flex items-center gap-2" title={`${a.label} — axis "${a.tag}", ${a.min}–${a.max}`}>
            <span className="w-24 shrink-0 truncate font-mono text-[10px] text-muted-foreground">
              &quot;{a.tag}&quot; {a.label}
            </span>
            <input
              type="range"
              min={a.min}
              max={a.max}
              step={a.max - a.min <= 1 ? 0.01 : 1}
              value={val}
              onChange={(e) => setAxis(a.tag, Number(e.target.value))}
              className="h-1.5 flex-1 accent-navy"
            />
            <input
              type="number"
              min={a.min}
              max={a.max}
              value={val}
              onChange={(e) => setAxis(a.tag, Number(e.target.value))}
              className="w-16 rounded-md border border-border bg-card px-1.5 py-1 font-mono text-xs text-foreground outline-none focus:border-navy"
            />
          </div>
        );
      })}
      <ComboInput value={value} options={["normal", axes.map((a) => `"${a.tag}" ${a.default}`).join(", ")]} onChange={onChange} />
    </div>
  );
}

function FeatureChecklist({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        {FEATURES.map((ft) => (
          <label key={ft.tag} className="flex items-center gap-1.5 text-xs text-foreground" title={`"${ft.tag}" — ${ft.label}`}>
            <input
              type="checkbox"
              checked={featureOn(value, ft.tag)}
              onChange={() => onChange(toggleFeature(value, ft.tag))}
              className="size-3.5 accent-navy"
            />
            <span className="font-mono text-[10px] text-muted-foreground">{ft.tag}</span>
            <span className="truncate text-[11px]">{ft.label}</span>
          </label>
        ))}
      </div>
      <div className="mt-2">
        <ComboInput value={value} options={["normal"]} onChange={onChange} placeholder='"tnum" 1, "onum" 1' />
      </div>
    </div>
  );
}

function TypeRoleRow({ role: def }: { role: TypeRole }) {
  const review = useReview();
  const [editing, setEditing] = useState(false);
  const role = review.typeRole(def);
  const dirty = review.isTypeDirty(def.id);

  const familyStack = review.familyStack(role.family, FAMILY_BY_ID.get(role.family)?.stack ?? []);
  const primary = familyStack[0] ?? "";
  useEffect(() => {
    ensureFont(primary);
  }, [primary]);

  const set = (patch: Partial<TypeRole>) => review.setTypeField(def.id, patch);

  const specimenStyle: React.CSSProperties = {
    fontFamily: stackToCss(familyStack),
    fontSize: `${role.sizePx}px`,
    lineHeight: role.lineHeight,
    fontWeight: role.weight,
    letterSpacing: role.letterSpacing,
    wordSpacing: role.wordSpacing,
    textTransform: role.textTransform as React.CSSProperties["textTransform"],
    fontStyle: role.fontStyle,
    fontVariationSettings: role.variationSettings,
    fontFeatureSettings: role.featureSettings,
  };

  const axes = VARIABLE_AXES[primary];

  return (
    <div className="rounded-lg border border-border p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <h3 className="text-base font-medium text-foreground">{role.label}</h3>
            <span className="font-mono text-xs text-muted-foreground">
              {role.sizePx}px / {role.weight} / {role.lineHeight} / {role.letterSpacing}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{role.role}</p>
        </div>
        <RowActions
          editing={editing}
          onToggleEdit={() => setEditing((v) => !v)}
          dirty={dirty}
          onReset={() => review.resetType(def.id)}
        />
      </div>

      {/* Specimen: overflow-x:clip (NOT auto — auto forces overflow-y to auto,
          which clips tall glyphs and forces a scroll). clip leaves overflow-y
          visible, so ascenders/descenders at any size show in full. */}
      <div className="mt-4 overflow-x-clip py-2">
        <span className="block whitespace-nowrap text-foreground" style={specimenStyle}>
          {role.sample}
        </span>
      </div>

      {editing ? (
        <EditPanel>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <Field label="Family slot" desc="Which font family this role renders in." accepts="title / body / mono">
              <SelectInput value={role.family} options={SLOT_OPTS} onChange={(v) => set({ family: v as TypeRole["family"] })} />
            </Field>
            <Field label="Size" hint="px" desc="Font size in pixels (rem is derived at 16px base)." accepts="a number in px, e.g. 16 (or type any)">
              <ComboInput
                value={String(role.sizePx)}
                options={SIZE_PRESETS}
                onChange={(v) => {
                  const n = Number(v);
                  if (!Number.isNaN(n) && v.trim() !== "") set({ sizePx: n, rem: `${(n / 16).toFixed(3)}rem` });
                }}
              />
            </Field>
            <Field label="Line height" hint="unitless" desc="Line-box height as a multiple of font size." accepts="unitless number (1.5) or a length; custom allowed">
              <ComboInput value={role.lineHeight} options={LINE_HEIGHT_PRESETS} onChange={(v) => set({ lineHeight: v })} />
            </Field>
            <Field label="Weight" desc="Font weight; the face must ship the weight." accepts="100–900; presets or custom">
              <ComboInput value={String(role.weight)} options={WEIGHT_PRESETS} onChange={(v) => { const n = Number(v); if (!Number.isNaN(n) && v.trim() !== "") set({ weight: n }); }} />
            </Field>
            <Field label="Letter spacing" hint="tracking" desc="Space added between characters (tracking)." accepts="em/px length or 'normal'; custom allowed">
              <ComboInput value={role.letterSpacing} options={LETTER_SPACING_PRESETS} onChange={(v) => set({ letterSpacing: v })} />
            </Field>
            <Field label="Word spacing" desc="Extra space between words." accepts="length or 'normal'; custom allowed">
              <ComboInput value={role.wordSpacing} options={WORD_SPACING_PRESETS} onChange={(v) => set({ wordSpacing: v })} />
            </Field>
            <Field label="Transform" desc="Letter-case transformation applied on render." accepts="none / uppercase / lowercase / capitalize">
              <SelectInput value={role.textTransform} options={TRANSFORM_OPTS} onChange={(v) => set({ textTransform: v as TypeRole["textTransform"] })} />
            </Field>
            <Field label="Style" desc="Upright, italic, or oblique." accepts="normal / italic / oblique">
              <SelectInput value={role.fontStyle} options={STYLE_OPTS} onChange={(v) => set({ fontStyle: v as TypeRole["fontStyle"] })} />
            </Field>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div>
              <p className="mb-1.5 flex items-center gap-1 text-xs font-medium text-foreground">
                Variable axes (compression / optical size)
                <InfoTip text={`Variable-font axes. ${primary} ${axes ? "exposes: " + axes.map((a) => `"${a.tag}" ${a.min}–${a.max}`).join(", ") : "exposes no known axes."} Accepts font-variation-settings, e.g. "opsz" 144, "SOFT" 0.`} />
              </p>
              <AxisControls face={primary} value={role.variationSettings} onChange={(v) => set({ variationSettings: v })} />
            </div>
            <div>
              <p className="mb-1.5 flex items-center gap-1 text-xs font-medium text-foreground">
                OpenType features
                <InfoTip text={'Toggle OpenType features, or edit the raw string. Accepts font-feature-settings, e.g. "tnum" 1, "onum" 1.'} />
              </p>
              <FeatureChecklist value={role.featureSettings} onChange={(v) => set({ featureSettings: v })} />
            </div>
          </div>
        </EditPanel>
      ) : null}
    </div>
  );
}
