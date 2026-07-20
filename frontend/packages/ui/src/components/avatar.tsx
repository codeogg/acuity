import { cn } from "../lib/cn";

// The one auto-generated avatar (FINAL.md avatar rule): an algorithmically-
// chosen base colour — a hash of the name, drawn from the tertiary/quaternary
// Caliber palette — never one fixed hex. Initials take a per-hue foreground
// for AA contrast: cream only clears 4.5:1 on the dark venice ground, so the
// mid/pastel accents carry ink instead (ADR 0043). Initials prefer the first
// CJK character when present (HK names are often bilingual); otherwise the
// first two Latin initials. Server-safe (no hooks).

const AVATAR_HUES: { bg: string; fg: string }[] = [
  { bg: "var(--caliber-glaucous)", fg: "var(--caliber-ink)" },
  { bg: "var(--caliber-muted-iris)", fg: "var(--caliber-ink)" },
  { bg: "var(--caliber-venice-blue)", fg: "var(--caliber-cream)" },
  { bg: "var(--caliber-eucalyptus)", fg: "var(--caliber-ink)" },
  { bg: "var(--caliber-slate-blue)", fg: "var(--caliber-ink)" },
  { bg: "var(--caliber-wisteria)", fg: "var(--caliber-ink)" },
  { bg: "var(--caliber-dust-blue)", fg: "var(--caliber-ink)" },
  { bg: "var(--caliber-mauve-taupe)", fg: "var(--caliber-ink)" },
];

function hueOf(name: string): { bg: string; fg: string } {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return AVATAR_HUES[hash % AVATAR_HUES.length] ?? AVATAR_HUES[0]!;
}

export function avatarInitials(name: string): string {
  const cjk = name.match(/[一-鿿]/);
  if (cjk) return cjk[0];
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export function Avatar({
  name,
  size = 32,
  className,
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  const hue = hueOf(name);
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center rounded-full font-medium",
        className,
      )}
      style={{
        width: size,
        height: size,
        backgroundColor: hue.bg,
        color: hue.fg,
        fontSize: Math.round(size * 0.38),
      }}
    >
      {avatarInitials(name)}
    </span>
  );
}
