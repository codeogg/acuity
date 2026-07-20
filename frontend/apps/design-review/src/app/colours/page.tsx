"use client";

// Colour roster, organised by BRAND classification (Main / Secondary /
// Tertiary / Quaternary accent) — the brand tier is first-class, the way each
// colour is used is the secondary "category" column. Each tier is a sortable
// table; every row edits its hex in place and re-renders the swatch live.
// Internal token names (--caliber-*) are intentionally not shown.

import { Fragment, useMemo, useState } from "react";
import { COLOR_TIERS, type ColorEntry, type ColorTier } from "../_lib/tokens";
import { useReview } from "../review-state";
import { PageToolbar, RowActions, EditPanel, Field, TextInput } from "../_components/controls";

type SortKey = "name" | "hex" | "category";

const isHex = (v: string) => /^#[0-9a-fA-F]{6}$/.test(v);

export default function ColoursPage() {
  const firstTokenId = COLOR_TIERS.find((t) => t.kind === "token")?.id;
  return (
    <div>
      <PageToolbar
        section="colours"
        title="Colour"
        blurb="Every colour the theme ships. The four brand tiers first, then the frontend/code token colours (semantic roles, charts, tones, states, aliases). Editing a hex updates the swatch and live preview immediately, is tracked until you export, and cascades: edit a source colour and every token — and every card — that references it follows."
      />
      <div className="flex flex-col gap-12">
        {COLOR_TIERS.map((tier) => (
          <Fragment key={tier.id}>
            {tier.id === firstTokenId ? <TokenSectionIntro /> : null}
            {tier.kind === "token" ? <TokenTable tier={tier} /> : <ColourTable tier={tier} />}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

// Lead-in before the first token tier, marking the shift from the curated brand
// palette to the raw frontend/code token colours.
function TokenSectionIntro() {
  return (
    <div className="border-t border-border-strong pt-8">
      <h2 className="text-2xl text-foreground">Frontend / code tokens</h2>
      <p className="mt-2 max-w-[75ch] text-sm text-muted-foreground">
        Every colour-bearing custom property the theme ships — semantic roles, sidebar, charts,
        interaction, field states, status tones, and surface aliases — shown by its css variable and
        definition. Most alias a brand primitive above; editing that primitive cascades to every token
        (and every card) that references it. You can also pin a token to its own colour here.
      </p>
    </div>
  );
}

function ColourTable({ tier }: { tier: ColorTier }) {
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [asc, setAsc] = useState(true);

  const sorted = useMemo(() => {
    if (!sortKey) return tier.entries;
    const rows = [...tier.entries];
    rows.sort((a, b) => a[sortKey].localeCompare(b[sortKey]));
    if (!asc) rows.reverse();
    return rows;
  }, [tier.entries, sortKey, asc]);

  const toggle = (k: SortKey) => {
    if (sortKey === k) setAsc((v) => !v);
    else {
      setSortKey(k);
      setAsc(true);
    }
  };

  return (
    <section>
      <h2 className="text-xl text-foreground">{tier.title}</h2>
      {tier.note ? <p className="mt-1 max-w-[75ch] text-sm text-muted-foreground">{tier.note}</p> : null}

      <div className="mt-4 overflow-hidden rounded-lg border border-border">
        {/* header */}
        <div className="grid grid-cols-[2.5rem_11rem_6.5rem_11rem_1fr_9rem] items-center gap-4 border-b border-border-strong bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground">
          <span aria-hidden />
          <SortHeader label="Name" active={sortKey === "name"} asc={asc} onClick={() => toggle("name")} />
          <SortHeader label="Hex" active={sortKey === "hex"} asc={asc} onClick={() => toggle("hex")} />
          <SortHeader label="Category" active={sortKey === "category"} asc={asc} onClick={() => toggle("category")} />
          <span>Used for</span>
          <span className="no-print text-right">Edit</span>
        </div>
        {sorted.map((entry, i) => (
          <ColourRow key={`${entry.id}-${i}`} entry={entry} first={i === 0} />
        ))}
      </div>
    </section>
  );
}

function SortHeader({ label, active, asc, onClick }: { label: string; active: boolean; asc: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`no-print flex items-center gap-1 text-left transition-colors hover:text-foreground ${active ? "text-foreground" : ""}`}
    >
      {label}
      <span className="font-mono text-[10px]">{active ? (asc ? "▲" : "▼") : "↕"}</span>
    </button>
  );
}

function ColourRow({ entry, first }: { entry: ColorEntry; first: boolean }) {
  const review = useReview();
  const [editing, setEditing] = useState(false);
  const value = review.colorValue(entry.cssVar, entry.hex);
  const dirty = review.isColorDirty(entry.cssVar);

  return (
    <div className={first ? "" : "border-t border-border"}>
      <div className="grid grid-cols-[2.5rem_11rem_6.5rem_11rem_1fr_9rem] items-center gap-4 px-4 py-2.5">
        <span
          aria-hidden
          className="size-8 shrink-0 rounded-md border border-border"
          style={{ backgroundColor: value }}
        />
        <span className="truncate text-sm font-medium text-foreground">{entry.name}</span>
        <span className="font-mono text-xs uppercase tabular-nums text-venice">{value}</span>
        <span className="truncate text-xs text-muted-foreground">{entry.category}</span>
        <span className="min-w-0 truncate text-xs text-muted-foreground" title={entry.usage}>
          {entry.usage}
        </span>
        <div className="flex justify-end">
          <RowActions
            editing={editing}
            onToggleEdit={() => setEditing((v) => !v)}
            dirty={dirty}
            onReset={() => review.resetColor(entry.cssVar)}
          />
        </div>
      </div>

      {editing ? (
        <div className="px-4 pb-4">
          <EditPanel>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[8rem_1fr_1fr]">
              <Field label="Swatch">
                <input
                  type="color"
                  value={isHex(value) ? value : entry.hex}
                  onChange={(e) => review.setColor(entry.cssVar, e.target.value.toUpperCase())}
                  className="h-9 w-full cursor-pointer rounded-md border border-border bg-card"
                />
              </Field>
              <Field label="Hex" hint="#RRGGBB">
                <TextInput value={value} onChange={(v) => review.setColor(entry.cssVar, v.toUpperCase())} />
              </Field>
              <Field label="Default" hint="live token">
                <div className="flex items-center gap-2 py-1.5">
                  <span className="size-5 rounded border border-border" style={{ backgroundColor: review.colorBase(entry.cssVar, entry.hex) }} />
                  <span className="font-mono text-xs text-muted-foreground">{review.colorBase(entry.cssVar, entry.hex)}</span>
                </div>
              </Field>
            </div>
          </EditPanel>
        </div>
      ) : null}
    </div>
  );
}

// ── Token (frontend/code) tiers ───────────────────────────────────────────────
// The css var is the subject: shown, editable, with its definition/alias. The
// swatch paints the JS-resolved value (not `var(--token)`): an alias like
// `--border: var(--caliber-border)` is substituted at its :root declaration, so
// a wrapper-scoped override of the source would NOT re-resolve it in CSS — but
// colorValue walks the alias chain through the overrides, so swatch and value
// both follow an edit to the source colour. Card demos reference the primitives
// directly, so they still cascade natively via the wrapper's custom properties.

function TokenTable({ tier }: { tier: ColorTier }) {
  return (
    <section>
      <h2 className="text-xl text-foreground">{tier.title}</h2>
      {tier.note ? <p className="mt-1 max-w-[75ch] text-sm text-muted-foreground">{tier.note}</p> : null}

      <div className="mt-4 overflow-hidden rounded-lg border border-border">
        <div className="grid grid-cols-[2.5rem_16rem_6.5rem_1fr_9rem] items-center gap-4 border-b border-border-strong bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground">
          <span aria-hidden />
          <span>Token</span>
          <span>Value</span>
          <span>Definition</span>
          <span className="no-print text-right">Edit</span>
        </div>
        {tier.entries.map((entry, i) => (
          <TokenRow key={entry.cssVar} entry={entry} first={i === 0} />
        ))}
      </div>
    </section>
  );
}

function TokenRow({ entry, first }: { entry: ColorEntry; first: boolean }) {
  const review = useReview();
  const [editing, setEditing] = useState(false);
  const value = review.colorValue(entry.cssVar, entry.hex);
  const dirty = review.isColorDirty(entry.cssVar);

  return (
    <div className={first ? "" : "border-t border-border"}>
      <div className="grid grid-cols-[2.5rem_16rem_6.5rem_1fr_9rem] items-center gap-4 px-4 py-2.5">
        <span
          aria-hidden
          className="size-8 shrink-0 rounded-md border border-border"
          style={{ backgroundColor: value }}
        />
        <span className="truncate font-mono text-xs text-foreground" title={entry.cssVar}>
          {entry.cssVar}
        </span>
        <span className="font-mono text-xs uppercase tabular-nums text-venice">{value}</span>
        <span className="min-w-0 truncate font-mono text-[11px] text-muted-foreground" title={entry.usage}>
          {entry.ref ? `→ ${entry.ref}` : entry.usage}
        </span>
        <div className="flex justify-end">
          <RowActions
            editing={editing}
            onToggleEdit={() => setEditing((v) => !v)}
            dirty={dirty}
            onReset={() => review.resetColor(entry.cssVar)}
          />
        </div>
      </div>

      {editing ? (
        <div className="px-4 pb-4">
          <EditPanel>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[8rem_1fr_1fr]">
              <Field label="Swatch">
                <input
                  type="color"
                  value={isHex(value) ? value : entry.hex}
                  onChange={(e) => review.setColor(entry.cssVar, e.target.value.toUpperCase())}
                  className="h-9 w-full cursor-pointer rounded-md border border-border bg-card"
                />
              </Field>
              <Field label="Hex" hint="#RRGGBB">
                <TextInput value={value} onChange={(v) => review.setColor(entry.cssVar, v.toUpperCase())} />
              </Field>
              <Field label="Default" hint="live token" desc="The ratified value this token resolves to before edits." accepts={entry.ref ? `aliases ${entry.ref}` : entry.usage}>
                <div className="flex items-center gap-2 py-1.5">
                  <span className="size-5 rounded border border-border" style={{ backgroundColor: review.colorBase(entry.cssVar, entry.hex) }} />
                  <span className="font-mono text-xs text-muted-foreground">{review.colorBase(entry.cssVar, entry.hex)}</span>
                </div>
              </Field>
            </div>
          </EditPanel>
        </div>
      ) : null}
    </div>
  );
}
