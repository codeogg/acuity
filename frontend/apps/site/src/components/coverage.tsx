import { cn } from "@/lib/cn";
import { getTranslations } from "next-intl/server";
import { CheckIcon, DotsIcon } from "@acuity/ui";
import { ArrowLink, Eyebrow } from "@/components/marketing";
import { INSURERS, insurersByStatus, type CoverageStatus } from "@/lib/insurers";

// Registry-driven coverage surfaces plus the shared status pill. Pill is the
// colour + icon + text marker (never colour alone): the launch appearance is
// the sage check, the roadmap appearance the steel dots — the label is the
// caller's (coverage launch/roadmap, or the Trust Centre's "In progress").

export function Pill({
  appearance,
  onDark,
  children,
}: {
  appearance: "launch" | "roadmap";
  onDark?: boolean;
  children: React.ReactNode;
}) {
  const Icon = appearance === "launch" ? CheckIcon : DotsIcon;
  return (
    <span
      className={cn(
        // Badge grammar: tint ground + tone GLYPH + ink label — eucalyptus is
        // only 3.4:1 as 12px label text on the sage tint (fine for the icon).
        "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-medium",
        // On dark panels the wash DARKENS the ground (navy tint): a cream
        // wash under cream 12px text lands at ~3.4:1.
        onDark
          ? "border-on-navy/30 bg-navy/25 text-on-navy"
          : appearance === "launch"
            ? "border-sage/50 bg-sage/[0.16] text-foreground"
            : "border-steel/45 bg-steel/[0.14] text-ink-muted",
      )}
    >
      <Icon
        className={cn("size-3.5", !onDark && appearance === "launch" && "text-eucalyptus")}
        strokeWidth={2}
      />
      {children}
    </span>
  );
}

export async function CoverageBadge({
  status,
  onDark,
}: {
  status: CoverageStatus;
  onDark?: boolean;
}) {
  const t = await getTranslations("coverage");
  return (
    <Pill appearance={status} onDark={onDark}>
      {t(status)}
    </Pill>
  );
}

export function InsurerChips() {
  return (
    <div className="flex flex-wrap gap-3">
      {INSURERS.map((r) => (
        <span
          key={r.name}
          className="inline-flex items-center gap-3 rounded-md border border-border bg-card px-4 py-3"
        >
          <strong className="font-semibold text-ink">{r.name}</strong>
          <CoverageBadge status={r.status} />
        </span>
      ))}
    </div>
  );
}

async function InsurerGroup({
  status,
  heading,
  locale,
}: {
  status: CoverageStatus;
  heading: string;
  locale: string;
}) {
  const t = await getTranslations("coverage");
  const zh = locale.startsWith("zh");
  const items = insurersByStatus(status);
  return (
    <div className="mt-10 first:mt-0">
      <Eyebrow className="mb-4">{heading}</Eyebrow>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {items.map((r) => (
          <div key={r.name} className="rounded-card border border-border bg-card p-6">
            <div className="flex items-start justify-between gap-3">
              <span className="font-title text-2xl leading-tight text-ink">{r.name}</span>
              <CoverageBadge status={r.status} />
            </div>
            <ul className="mt-4 flex flex-col gap-2 text-sm text-ink-muted">
              {r.forms.map((f) => (
                <li key={f.en} className="flex items-center gap-2">
                  <span className="size-1.25 flex-none rounded-full bg-glaucous" />
                  <span>{zh ? f.zh : f.en}</span>
                </li>
              ))}
            </ul>
            {r.slug ? (
              <ArrowLink href={`/insurers/${r.slug}`} className="mt-4">
                {t("see-forms", { name: r.name })}
              </ArrowLink>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

export async function InsurerCards({ locale }: { locale: string }) {
  const t = await getTranslations("coverage");
  return (
    <div>
      <InsurerGroup status="launch" heading={t("launch")} locale={locale} />
      <InsurerGroup status="roadmap" heading={t("roadmap")} locale={locale} />
    </div>
  );
}
