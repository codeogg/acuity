import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { formatDate } from "@acuity/i18n";
import { ShieldCheckIcon } from "@acuity/ui";
import { Band, Eyebrow, HeroBox, SectionHead, Panel } from "@/components/marketing";
import { HandoffButton } from "@/components/handoff";
import { Pill } from "@/components/coverage";
import { COMPLIANCE_EMAIL } from "@/lib/channels";
import { pageMetadata } from "@/lib/seo";

// The trust centre carries a dated freshness stamp: a maintained date is the
// actual claim a compliance-minded reader checks. Update whenever any posture
// statement on this page changes.
const TRUST_LAST_REVIEWED = "2026-07-11";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return pageMetadata({
    locale,
    path: "/security",
    title: t("security.title"),
    description: t("security.description"),
  });
}

export default async function SecurityPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("security");

  const dpps = [
    { code: "DPP1", body: t("dpp1") },
    { code: "DPP3", body: t("dpp3") },
    { code: "DPP4", body: t("dpp4") },
    { code: "DPP6", body: t("dpp6") },
  ];

  return (
    <>
      {/* Hero */}
      <HeroBox compact>
        <div className="mx-auto max-w-3xl text-center">
          <span className="hero-rise inline-flex size-13 items-center justify-center rounded-card bg-on-navy/10 text-sky-blue">
            <ShieldCheckIcon className="size-6.5" />
          </span>
          <h1
            className="title-tracking hero-rise mt-6 text-h1 text-on-navy"
            style={{ animationDelay: "60ms" }}
          >
            {t("hero-title")}
          </h1>
          <p
            className="hero-rise mx-auto mt-5 max-w-[58ch] text-body-lg text-on-navy/75"
            style={{ animationDelay: "120ms" }}
          >
            {t("hero-lede")}
          </p>
          <p
            className="hero-rise mt-4 text-sm text-on-navy/60"
            style={{ animationDelay: "160ms" }}
          >
            {t("last-reviewed", {
              date: formatDate(TRUST_LAST_REVIEWED, locale, {
                timeZone: "Asia/Hong_Kong",
              }),
            })}
          </p>
          <div className="hero-rise mt-8" style={{ animationDelay: "200ms" }}>
            <HandoffButton kind="email" href={COMPLIANCE_EMAIL} tier="secondary">
              {t("hero-cta")}
            </HandoffButton>
          </div>
        </div>
      </HeroBox>

      {/* Residency & access */}
      <Band>
        <div className="grid grid-cols-1 gap-6 cards:grid-cols-2">
          <div className="rounded-card border border-border bg-card p-6">
            <Eyebrow>{t("residency-eyebrow")}</Eyebrow>
            <h2 className="mt-2 font-title text-h3 text-ink">{t("residency-title")}</h2>
            <p className="mt-3 text-ink-muted">{t("residency-body")}</p>
          </div>
          <div className="rounded-card border border-border bg-card p-6">
            <Eyebrow>{t("access-eyebrow")}</Eyebrow>
            <h2 className="mt-2 font-title text-h3 text-ink">{t("access-title")}</h2>
            <p className="mt-3 text-ink-muted">{t("access-body")}</p>
          </div>
        </div>
      </Band>

      {/* Regulatory alignment (venice panel) */}
      <Band>
        <Panel tone="venice">
          <Eyebrow tone="on-panel" className="mb-3">
            {t("reg-eyebrow")}
          </Eyebrow>
          <h2 className="text-h2 text-on-navy">{t("reg-title")}</h2>
          <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-4">
            {dpps.map((d) => (
              <div key={d.code}>
                <p className="font-title text-h3 text-on-navy">{d.code}</p>
                <p className="mt-2 text-sm text-on-navy/80">{d.body}</p>
              </div>
            ))}
          </div>
        </Panel>
      </Band>

      {/* Subprocessors */}
      <Band>
        <SectionHead eyebrow={t("sub-eyebrow")} title={t("sub-title")} />
        <div className="mt-6 overflow-hidden rounded-md border border-border bg-card">
          <SubRow title={t("sub1-title")} sub={t("sub1-sub")}>
            <Pill appearance="launch">ISO 27001</Pill>
          </SubRow>
          <SubRow title={t("sub2-title")} sub={t("sub2-sub")}>
            <Pill appearance="launch">ISO 27001</Pill>
          </SubRow>
          <SubRow title={t("sub3-title")} sub={t("sub3-sub")} last>
            {/* certification-in-progress: the dots pill with the honest label */}
            <Pill appearance="roadmap">{t("sub-in-progress")}</Pill>
          </SubRow>
        </div>
        <p className="mt-4 max-w-[70ch] text-sm text-muted-foreground">{t("sub-note")}</p>
      </Band>

      {/* Compliance contact */}
      <Band>
        <div className="flex flex-wrap items-center justify-between gap-5">
          <div className="max-w-[46ch]">
            <Eyebrow className="mb-2">{t("contact-eyebrow")}</Eyebrow>
            <h2 className="title-tracking text-h3 text-ink">{t("contact-title")}</h2>
          </div>
          <HandoffButton kind="email" href={COMPLIANCE_EMAIL} tier="ghost">
            {t("contact-cta")}
          </HandoffButton>
        </div>
      </Band>
    </>
  );
}

function SubRow({
  title,
  sub,
  children,
  last,
}: {
  title: string;
  sub: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-4 px-5 py-4 ${
        last ? "" : "border-b border-border"
      }`}
    >
      <span>
        <strong className="font-semibold text-ink">{title}</strong>
        <br />
        <span className="text-sm text-muted-foreground">{sub}</span>
      </span>
      <span className="self-center">{children}</span>
    </div>
  );
}
