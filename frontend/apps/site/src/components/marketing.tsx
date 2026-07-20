import { cn } from "@/lib/cn";
import type { ReactNode } from "react";
import { Button, ArrowRightIcon } from "@acuity/ui";
import { Link } from "@/i18n/navigation";

// Shared marketing building blocks implementing the caliber contained-band
// system: a max-width container, vertical bands separated by spacing (never
// rules), wide inset coloured panels, recessed wells, numbered step lists, and
// the branded button/arrow-link tiers. All colour + spacing + radius + type via
// caliber tokens; the button tiers are the shared design-kit Button rendered
// asChild over the localised Link.

export function Container({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto w-full max-w-content px-4 md:px-8 lg:px-12", className)}>
      {children}
    </div>
  );
}

// A band's ground is always the cream page canvas. Vertical rhythm between
// sections is owned by the layout's uniform flex gap (--spacing-band), so a
// band carries no vertical padding of its own — every box-to-box and
// box-to-footer gap is identical. `tight` is retained for API compatibility
// but no longer alters spacing.
export function Band({
  children,
  id,
}: {
  children: ReactNode;
  tight?: boolean;
  id?: string;
}) {
  return (
    <section id={id} className="bg-cream">
      <Container>{children}</Container>
    </section>
  );
}

// ---- Boxed bands (Aeline-grammar canvas) -----------------------------------
// The page opens on a full-width rounded box inset from the viewport by the
// frame gap; the floating header sits over its top edge. `hero` (home) carries
// the tall composition, `compact` carries the subpage title band. Ground is
// the navy hero wash; content is centred.

export function HeroBox({
  children,
  compact,
  className,
}: {
  children: ReactNode;
  compact?: boolean;
  className?: string;
}) {
  return (
    <section className="bg-cream px-frame pt-frame">
      <div className="ground-dark hero-ground relative overflow-hidden rounded-box text-on-navy">
        <Container
          className={cn(
            "relative",
            compact
              ? "pb-12 pt-24 md:pb-14 md:pt-26"
              : "pb-10 pt-24 md:pb-14 md:pt-30",
            className,
          )}
        >
          {children}
        </Container>
      </div>
    </section>
  );
}

// Subpage boxed title band: centred kicker + display title + optional lede,
// plus optional extra content (chips, CTAs) below.
export function PageHero({
  eyebrow,
  title,
  lede,
  children,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  lede?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <HeroBox compact>
      <div className="mx-auto max-w-3xl text-center">
        {eyebrow ? (
          <Eyebrow tone="on-panel" center className="hero-rise mb-4">
            {eyebrow}
          </Eyebrow>
        ) : null}
        <h1
          className="title-tracking hero-rise text-h1 text-on-navy"
          style={{ animationDelay: "60ms" }}
        >
          {title}
        </h1>
        {lede ? (
          <p
            className="hero-rise mx-auto mt-5 max-w-[58ch] text-body-lg text-on-navy/75"
            style={{ animationDelay: "120ms" }}
          >
            {lede}
          </p>
        ) : null}
        {children ? (
          <div className="hero-rise mt-8" style={{ animationDelay: "180ms" }}>
            {children}
          </div>
        ) : null}
      </div>
    </HeroBox>
  );
}

type EyebrowTone = "steel" | "on-panel";

// Kicker label — mono uppercase with a leading dot (Aeline "• ABOUT US"
// grammar). `center` centres the run for boxed / centred section heads.
export function Eyebrow({
  children,
  tone = "steel",
  center,
  className,
}: {
  children: ReactNode;
  tone?: EyebrowTone;
  center?: boolean;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "flex items-center gap-2 font-mono text-xs font-medium uppercase tracking-eyebrow",
        center && "justify-center",
        tone === "on-panel" ? "text-on-navy/70" : "text-muted-foreground",
        className,
      )}
    >
      <span aria-hidden className="kicker-dot leading-none">
        ●
      </span>
      <span>{children}</span>
    </p>
  );
}

export function SectionHead({
  eyebrow,
  title,
  lede,
  center,
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  lede?: ReactNode;
  center?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "max-w-[62ch]",
        center && "mx-auto text-center",
        className,
      )}
    >
      {eyebrow ? (
        <Eyebrow center={center} className="mb-3">
          {eyebrow}
        </Eyebrow>
      ) : null}
      <h2 className="title-tracking text-h2 text-ink">{title}</h2>
      {lede ? (
        <p
          className={cn(
            "mt-4 max-w-[60ch] text-body-lg text-ink-muted",
            center && "mx-auto",
          )}
        >
          {lede}
        </p>
      ) : null}
    </div>
  );
}

type PanelTone = "navy" | "accent" | "venice";

const panelToneClass: Record<PanelTone, string> = {
  navy: "bg-navy text-on-navy",
  // Accent panels sit on venice, not glaucous: the small cream copy they
  // carry (eyebrows, /80 body) is 3.3–3.9:1 on glaucous (AA fail) but ≥5.7:1
  // on venice. A darker AA-safe mid-blue primitive can re-split the two tones
  // later if the band variety is missed.
  accent: "bg-venice text-on-navy",
  venice: "bg-venice text-on-navy",
};

export function Panel({
  children,
  tone = "navy",
  center,
  className,
}: {
  children: ReactNode;
  tone?: PanelTone;
  center?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "ground-dark rounded-box p-8 md:p-14",
        panelToneClass[tone],
        center && "text-center",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Well({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        // Recessed well: a cool light-blue tint (clearly distinct from the
        // warm cream ground, without darkening toward beige).
        "rounded-card border border-sky-blue/40 bg-sky-blue/15 p-6 md:p-12",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function InfoCard({
  eyebrow,
  title,
  children,
  bodySize = "sm",
  className,
}: {
  eyebrow?: ReactNode;
  title?: ReactNode;
  children: ReactNode;
  bodySize?: "sm" | "md";
  className?: string;
}) {
  return (
    <div className={cn("rounded-card border border-border bg-card p-6", className)}>
      {eyebrow ? <Eyebrow className="mb-2">{eyebrow}</Eyebrow> : null}
      {title ? <h3 className="text-xl leading-tight text-ink">{title}</h3> : null}
      <div
        className={cn(
          title || eyebrow ? "mt-3" : "",
          bodySize === "md" ? "text-base" : "text-sm",
          "text-ink-muted",
        )}
      >
        {children}
      </div>
    </div>
  );
}

export type Step = { num: string; title: ReactNode; body: ReactNode };

export function StepList({
  steps,
  columns = 3,
  titleSize,
  bodySize = "md",
  onPanel,
  className,
}: {
  steps: Step[];
  columns?: 3 | 5;
  // Reference ramp: 3-col steps carry the fluid h3; 5-col steps step down.
  titleSize?: "h3" | "title-sm" | "xl";
  bodySize?: "sm" | "md";
  onPanel?: boolean;
  className?: string;
}) {
  const resolvedTitle = titleSize ?? (columns === 3 ? "h3" : "title-sm");
  const titleClass =
    resolvedTitle === "h3"
      ? "text-h3"
      : resolvedTitle === "title-sm"
        ? "text-title-sm"
        : "text-xl leading-tight";
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-8",
        columns === 3 ? "md:grid-cols-3" : "md:grid-cols-5",
        className,
      )}
    >
      {steps.map((s) => (
        <div key={s.num}>
          <div
            className={cn(
              // Venice, not glaucous: the 12px step numbers are text, and
              // glaucous is 3.9:1 on cream.
              "mb-3 font-mono text-xs tracking-eyebrow",
              onPanel ? "text-on-navy/85" : "text-venice",
            )}
          >
            {s.num}
          </div>
          <h3
            className={cn("mb-2", titleClass, onPanel ? "text-on-navy" : "text-ink")}
          >
            {s.title}
          </h3>
          <p
            className={cn(
              bodySize === "md" ? "text-base" : "text-sm",
              onPanel ? "text-on-navy/80" : "text-ink-muted",
            )}
          >
            {s.body}
          </p>
        </div>
      ))}
    </div>
  );
}

// Branded arrow-link with information scent (venice → navy on hover, colour only).
export function ArrowLink({
  href,
  children,
  className,
  onDark,
}: {
  href: string;
  children: ReactNode;
  className?: string;
  onDark?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        // -my-1 py-1: a ≥24px hit box (WCAG 2.2 target size — these links
        // stand alone, so the inline exemption does not apply) without
        // shifting the visual rhythm.
        "-my-1 inline-flex items-center gap-1 py-1 text-sm font-medium transition-colors",
        onDark ? "text-on-navy hover:text-sky-blue" : "text-venice hover:text-navy",
        className,
      )}
    >
      <span>{children}</span>
      <ArrowRightIcon className="size-4" />
    </Link>
  );
}

// ---- Button tiers (shared design-kit Button, marketing geometry) ----------
// The button system: 44px (md) / 48px (lg) PILL geometry with mono
// uppercase labels (Aeline grammar over Caliber tokens), colour-only hover on
// the pill itself; the optional trailing arrow chip carries the hover motion
// (the icon animates inside a fixed chip — button geometry never moves). Each
// tier is the shared Button rendered asChild over the localised Link, with the
// marketing size + tier colours merged on top.

export type MarketingButtonSize = "md" | "lg";

export function marketingButtonSizeClass(
  size: MarketingButtonSize,
  opts?: { chip?: boolean },
) {
  const pad = opts?.chip
    ? size === "lg"
      ? "pl-6 pr-3"
      : "pl-4 pr-2"
    : size === "lg"
      ? "px-6"
      : "px-4";
  return cn(
    "group/btn rounded-full font-mono font-medium uppercase tracking-chip",
    size === "lg" ? "h-12 gap-2.5 text-xs" : "h-11 gap-2 text-xs",
    pad,
  );
}

// The animated arrow chip — a fixed circular chip whose diagonal arrow slides
// out top-right while its twin slides in from bottom-left on button hover.
// Motion is confined to the icon; the chip and button keep a fixed box.
export function ArrowChip({
  tone = "navy",
  className,
}: {
  tone?: "navy" | "cream" | "sky";
  className?: string;
}) {
  const toneClass =
    tone === "navy"
      ? "bg-navy text-on-navy"
      : tone === "sky"
        ? "bg-sky-blue text-navy"
        : "bg-cream text-navy";
  return (
    <span
      aria-hidden
      className={cn(
        "relative inline-flex size-7 flex-none items-center justify-center overflow-hidden rounded-full",
        toneClass,
        className,
      )}
    >
      <ArrowRightIcon className="chip-arrow size-3.5 -rotate-45" />
      <ArrowRightIcon className="chip-arrow-in absolute size-3.5 -rotate-45" />
    </span>
  );
}

function TierButton({
  href,
  children,
  size = "md",
  variant,
  className,
}: {
  href: string;
  children: ReactNode;
  size?: MarketingButtonSize;
  variant: "default" | "secondary" | "outline";
  className?: string;
}) {
  return (
    <Button
      asChild
      variant={variant}
      className={cn(marketingButtonSizeClass(size), className)}
    >
      <Link href={href}>
        <span className="btn-label">{children}</span>
      </Link>
    </Button>
  );
}

// Filled navy primary (internal route).
export function PrimaryButton(props: {
  href: string;
  children: ReactNode;
  size?: MarketingButtonSize;
  className?: string;
}) {
  return <TierButton {...props} variant="default" />;
}

// Filled blue secondary (internal route); cream text per the reference tier.
// Venice rather than glaucous fill: cream on glaucous is 3.9:1 (fails AA for
// the 14px label); cream on venice is 7.6:1, with venice-deep as the darker
// hover step.
export function SecondaryButton({
  className,
  ...props
}: {
  href: string;
  children: ReactNode;
  size?: MarketingButtonSize;
  className?: string;
}) {
  return (
    <TierButton
      {...props}
      variant="secondary"
      className={cn("bg-venice text-on-navy hover:bg-venice-deep", className)}
    />
  );
}

// Hairline ghost (internal route). Border + wash only on hover.
export function GhostButton({
  className,
  ...props
}: {
  href: string;
  children: ReactNode;
  size?: MarketingButtonSize;
  className?: string;
}) {
  return (
    <TierButton
      {...props}
      variant="outline"
      className={cn(
        "text-navy hover:border-border-strong hover:bg-accent hover:text-navy",
        className,
      )}
    />
  );
}

// Cream on-fill primary for coloured panels (internal route).
export function OnFillButton({
  href,
  children,
  size = "lg",
  className,
}: {
  href: string;
  children: ReactNode;
  size?: MarketingButtonSize;
  className?: string;
}) {
  return (
    <Button
      asChild
      className={cn(
        marketingButtonSizeClass(size, { chip: true }),
        "bg-cream text-navy hover:bg-white",
        className,
      )}
    >
      <Link href={href}>
        <span className="btn-label">{children}</span>
        <ArrowChip tone="navy" />
      </Link>
    </Button>
  );
}

// Hairline ghost for dark boxed grounds (hero box / navy panels).
export function OnBoxGhostButton({
  href,
  children,
  size = "lg",
  className,
}: {
  href: string;
  children: ReactNode;
  size?: MarketingButtonSize;
  className?: string;
}) {
  return (
    <Button
      asChild
      className={cn(
        marketingButtonSizeClass(size),
        "border border-on-navy/30 bg-transparent text-on-navy hover:bg-on-navy/10 hover:text-on-navy",
        className,
      )}
    >
      <Link href={href}>
        <span className="btn-label">{children}</span>
      </Link>
    </Button>
  );
}
