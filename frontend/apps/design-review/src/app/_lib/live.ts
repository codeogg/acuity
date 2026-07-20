// Reads the ACTUAL current token values from the loaded @acuity/ui stylesheet
// at runtime, so the review baseline is the real deployed value — not a
// transcription that could drift. Colours resolve through a painted probe (so
// aliases/colour functions collapse to a final rgb); elevations read the raw
// custom property and parse it back into editable layers.

import type { ShadowLayer } from "./tokens";

function toHex(rgb: string): string | null {
  const m = rgb.match(/rgba?\(([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?/);
  if (!m) return null;
  // Fully transparent / unresolved → treat as "not defined here".
  if (m[4] !== undefined && Number(m[4]) === 0) return null;
  const hex = [m[1], m[2], m[3]].map((c) => Math.round(Number(c)).toString(16).padStart(2, "0")).join("");
  return `#${hex.toUpperCase()}`;
}

/** Resolve one colour custom property to a final hex, or null if undefined here. */
export function readLiveColor(probe: HTMLElement, cssVar: string): string | null {
  probe.style.backgroundColor = "";
  probe.style.backgroundColor = `var(${cssVar})`;
  const resolved = getComputedStyle(probe).backgroundColor;
  if (!resolved) return null;
  return toHex(resolved);
}

/** Split a box-shadow value on top-level commas (ignoring commas inside rgba()). */
function splitLayers(value: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of value) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      if (cur.trim()) out.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Parse a CSS box-shadow string into editable layers (token order: X Y blur spread colour). */
export function parseBoxShadow(value: string): ShadowLayer[] {
  const v = value.trim();
  if (!v || v === "none") return [];
  return splitLayers(v).map((layer) => {
    const colorMatch = layer.match(/(rgba?\([^)]*\)|hsla?\([^)]*\)|#[0-9a-fA-F]{3,8}|\b[a-zA-Z]+\b(?!\s*\())/);
    let color = "";
    let rest = layer;
    if (colorMatch) {
      color = colorMatch[0];
      rest = layer.replace(colorMatch[0], "").trim();
    }
    const nums = rest.split(/\s+/).filter(Boolean);
    return {
      offsetX: nums[0] ?? "0",
      offsetY: nums[1] ?? "0",
      blur: nums[2] ?? "0",
      spread: nums[3] ?? "0",
      color,
    };
  });
}

/** Read one elevation custom property into layers, or null if undefined. */
export function readLiveShadow(cssVar: string): ShadowLayer[] | null {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim();
  if (!raw) return null;
  return parseBoxShadow(raw);
}
