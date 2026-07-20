import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeftIcon } from "@acuity/ui";
import { Band, Eyebrow, GhostButton, HeroBox, Panel } from "@/components/marketing";
import { WhatsAppButton } from "@/components/handoff";
import { ReviewMock, type ReviewMockCopy, type MockField } from "@/components/review-mock";
import { CoverageBadge, Pill } from "@/components/coverage";
import { ClosingCta } from "@/components/closing-cta";
import { Link } from "@/i18n/navigation";
import { WHATSAPP } from "@/lib/channels";
import { requireCoverage } from "@/lib/insurers";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return pageMetadata({
    locale,
    path: "/insurers/bupa",
    title: t("bupa.title"),
    description: t("bupa.description"),
  });
}

export default async function BupaPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("bupa");
  const m = await getTranslations("mock");
  const coverage = await getTranslations("coverage");

  // Coverage claims on this page are registry-driven: the hero badge and the
  // supported-forms cards render from the canonical registry entry, and the
  // build fails if the registry stops granting Bupa launch coverage.
  const insurer = requireCoverage("Bupa", "launch");
  const zh = locale.startsWith("zh");

  const mockCopy: ReviewMockCopy = {
    panelLabel: m("panel-label"),
    chip: t("mock-chip"),
    synthetic: m("synthetic"),
    sourceHead: m("source-head"),
    linkedLabel: m("linked"),
    figureLabel: t("figure-label"),
    signLabel: m("sign"),
    statusLabels: {
      confirmed: m("status.confirmed"),
      drafted: m("status.drafted"),
      needs: m("status.needs"),
      optional: m("status.optional"),
    },
    sourceParagraphs: [
      [
        { text: t("mock-source1-mark"), mark: true },
        { text: t("mock-source1-post") },
      ],
      [{ text: t("mock-source2") }],
    ],
  };
  const mockFields: MockField[] = [
    {
      category: t("mock-visit-cat"),
      label: t("mock-complaint"),
      value: t("mock-complaint-value"),
      status: "drafted",
      linked: true,
    },
    {
      label: t("mock-diagnosis"),
      value: t("mock-diagnosis-value"),
      status: "confirmed",
    },
    {
      label: t("mock-fee"),
      value: t("mock-needs-input"),
      status: "needs",
      required: true,
      placeholder: true,
    },
  ];

  const forms = insurer.forms.map((f) => (zh ? f.zh : f.en));

  return (
    <>
      {/* Hero (insurer-named) */}
      <HeroBox compact>
        <p className="hero-rise text-sm">
          <Link
            href="/insurers"
            className="inline-flex items-center gap-1 font-medium text-on-navy/75 transition-colors hover:text-on-navy"
          >
            <ArrowLeftIcon className="size-4" />
            <span>{t("back")}</span>
          </Link>
        </p>
        <div className="mx-auto mt-8 max-w-3xl text-center">
          <div
            className="hero-rise inline-flex items-center gap-3 rounded-full border border-on-navy/25 bg-on-navy/5 px-4 py-2"
            style={{ animationDelay: "40ms" }}
          >
            <span className="font-title text-title-sm font-semibold text-on-navy">
              Bupa
            </span>
            <CoverageBadge status={insurer.status} onDark />
          </div>
          <h1
            className="title-tracking hero-rise mt-6 text-h1 text-on-navy"
            style={{ animationDelay: "80ms" }}
          >
            {t("hero-title-lead")}
            <em className="italic text-sky-blue">{t("hero-title-em")}</em>
          </h1>
          <p
            className="hero-rise mx-auto mt-5 max-w-[58ch] text-body-lg text-on-navy/75"
            style={{ animationDelay: "140ms" }}
          >
            {t("hero-lede")}
          </p>
          <div
            className="hero-rise mt-8 flex flex-wrap items-center justify-center gap-3"
            style={{ animationDelay: "200ms" }}
          >
            <WhatsAppButton href={WHATSAPP} onBox>
              {t("hero-cta")}
            </WhatsAppButton>
          </div>
          <p
            className="hero-rise mx-auto mt-6 max-w-[46ch] text-xs text-on-navy/55"
            style={{ animationDelay: "240ms" }}
          >
            {t("trademark")}
          </p>
        </div>
        <div
          className="hero-rise mx-auto mt-12 w-full max-w-4xl"
          style={{ animationDelay: "300ms" }}
        >
          <ReviewMock copy={mockCopy} fields={mockFields} className="shadow-lg" />
        </div>
      </HeroBox>

      {/* Supported Bupa forms */}
      <Band>
        <Panel tone="accent">
          <Eyebrow tone="on-panel" className="mb-3">
            {t("forms-eyebrow")}
          </Eyebrow>
          <h2 className="text-h2 text-on-navy">{t("forms-title")}</h2>
          <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
            {forms.map((f) => (
              <div
                key={f}
                className="rounded-md border border-on-navy/20 bg-on-navy/10 p-6"
              >
                <h3 className="text-xl leading-tight text-on-navy">{f}</h3>
                <div className="mt-3">
                  <Pill appearance={insurer.status} onDark>
                    {coverage(insurer.status)}
                  </Pill>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </Band>

      {/* Roadmap routing */}
      <Band>
        <div className="flex flex-wrap items-center justify-between gap-5">
          <div className="max-w-[48ch]">
            <Eyebrow className="mb-2">{t("roadmap-eyebrow")}</Eyebrow>
            <h2 className="title-tracking text-h3 text-ink">{t("roadmap-title")}</h2>
          </div>
          <GhostButton href="/contact">{t("roadmap-cta")}</GhostButton>
        </div>
      </Band>

      <ClosingCta title={t("closing-title")} lede="" primaryLabel={t("hero-cta")} />
    </>
  );
}
