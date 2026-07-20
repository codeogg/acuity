// Lean SVG report primitives (sparkline + bars + split bar) — aggregates only,
// tone hues from the theme tokens, server-safe.

const tint = (hue: string, pct: number) => `color-mix(in srgb, ${hue} ${pct}%, transparent)`;

export function Sparkline({
  data,
  width = 240,
  height = 56,
  hue = "var(--caliber-glaucous)",
}: {
  data: number[];
  width?: number;
  height?: number;
  hue?: string;
}) {
  if (data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => [
    (i / (data.length - 1)) * width,
    height - ((v - min) / range) * (height - 8) - 4,
  ]);
  const line = pts
    .map((p, i) => `${i === 0 ? "M" : "L"}${(p[0] ?? 0).toFixed(1)} ${(p[1] ?? 0).toFixed(1)}`)
    .join(" ");
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden>
      <path d={`${line} L${width} ${height} L0 ${height} Z`} fill={tint(hue, 10)} />
      <path d={line} fill="none" stroke={hue} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Bars({
  data,
  labels,
  hue = "var(--caliber-glaucous)",
}: {
  data: number[];
  labels?: string[];
  hue?: string;
}) {
  const max = Math.max(...data, 1);
  return (
    <div className="mt-2 flex h-36 items-end gap-2.5">
      {data.map((v, i) => (
        <div key={i} className="flex-1 text-center">
          <div
            className="rounded-t border"
            style={{
              height: `${(v / max) * 110}px`,
              background: tint(hue, 50),
              borderColor: tint(hue, 70),
            }}
          />
          {labels ? <div className="mt-1.5 text-xs text-muted-foreground">{labels[i]}</div> : null}
        </div>
      ))}
    </div>
  );
}

export function SplitBar({ leftPct, leftHue, rightHue }: { leftPct: number; leftHue: string; rightHue: string }) {
  return (
    <div className="flex h-7 overflow-hidden rounded-md" aria-hidden>
      <div style={{ width: `${leftPct}%`, background: tint(leftHue, 70) }} />
      <div style={{ width: `${100 - leftPct}%`, background: tint(rightHue, 60) }} />
    </div>
  );
}

export function FunnelBar({ segments }: { segments: { value: number; hue: string }[] }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0) || 1;
  return (
    <div className="flex gap-1" aria-hidden>
      {segments.map((s, i) => (
        <div
          key={i}
          className="h-1.5 rounded-full"
          style={{ flex: Math.max(s.value / total, 0.04), background: tint(s.hue, 55) }}
        />
      ))}
    </div>
  );
}
