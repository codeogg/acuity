import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ShieldCheckIcon } from "@acuity/ui";
import {
  ArrowLink,
  Band,
  Eyebrow,
  HeroBox,
  OnBoxGhostButton,
  Panel,
  SectionHead,
  StepList,
  Well,
  type Step,
} from "@/components/marketing";
import { Reveal } from "@/components/reveal";
import { WhatsAppButton } from "@/components/handoff";
import { ReviewMock, type ReviewMockCopy, type MockField } from "@/components/review-mock";
import { InsurerChips } from "@/components/coverage";
import { ClosingCta } from "@/components/closing-cta";
import { EMAIL_ADDRESS, WHATSAPP } from "@/lib/channels";
import { pageMetadata, SITE_URL } from "@/lib/seo";

// Organization structured data (schema.org JSON-LD) on the home page only:
// minimal, verifiable facts — name, canonical origin, contact address, area
// served. Nothing aspirational; coverage claims stay in the registry.
const ORG_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Acuity",
  url: SITE_URL,
  email: EMAIL_ADDRESS,
  areaServed: "HK",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return pageMetadata({
    locale,
    path: "",
    title: t("home.title"),
    description: t("home.description"),
  });
}

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("home");
  const m = await getTranslations("mock");
  const cta = await getTranslations("cta");

  const mockCopy: ReviewMockCopy = {
    panelLabel: m("panel-label"),
    chip: t("mock-chip"),
    sourceHead: m("source-head"),
    // The home figure labels the linked field "From your record" (reference);
    // the deeper pages use "Source linked".
    linkedLabel: m("source-head"),
    figureLabel: t("figure-label"),
    signLabel: m("sign"),
    footNote: t("mock-foot"),
    statusLabels: {
      confirmed: m("status.confirmed"),
      drafted: m("status.drafted"),
      needs: m("status.needs"),
      optional: m("status.optional"),
    },
    sourceParagraphs: [
      [{ text: t("mock-source1") }],
      [
        { text: t("mock-source2-pre") },
        { text: t("mock-source2-mark"), mark: true },
        { text: t("mock-source3") },
      ],
    ],
  };
  const mockFields: MockField[] = [
    {
      category: t("mock-diagnosis-cat"),
      label: t("mock-primary-diagnosis"),
      value: t("mock-primary-diagnosis-value"),
      status: "confirmed",
      linked: true,
    },
    {
      label: t("mock-onset"),
      value: t("mock-onset-value"),
      status: "drafted",
    },
    {
      label: t("mock-procedure"),
      value: t("mock-needs-input"),
      status: "needs",
      required: true,
      placeholder: true,
    },
  ];

  const steps: Step[] = [
    { num: "01", title: t("step1-title"), body: t("step1-body") },
    { num: "02", title: t("step2-title"), body: t("step2-body") },
    { num: "03", title: t("step3-title"), body: t("step3-body") },
  ];

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ORG_JSON_LD) }}
      />
      {/* Hero — the boxed landing composition: centred copy + CTAs with the
          review-surface figure floating on the box ground below. */}
      <HeroBox>
        <div className="mx-auto max-w-3xl text-center">
          <Eyebrow tone="on-panel" center className="hero-rise">
            {t("hero-eyebrow")}
          </Eyebrow>
          <h1
            className="title-tracking hero-rise mt-5 font-title text-display text-on-navy"
            style={{ animationDelay: "60ms" }}
          >
            {t("hero-title-lead")}
            <em className="italic text-sky-blue">{t("hero-title-em")}</em>
          </h1>
          <p
            className="hero-rise mx-auto mt-6 max-w-[54ch] text-body-lg text-on-navy/75"
            style={{ animationDelay: "120ms" }}
          >
            {t("hero-lede")}
          </p>
          <div
            className="hero-rise mt-9 flex flex-wrap items-center justify-center gap-3"
            style={{ animationDelay: "180ms" }}
          >
            <WhatsAppButton href={WHATSAPP} onBox>
              {cta("whatsapp")}
            </WhatsAppButton>
            <OnBoxGhostButton href="/how-it-works">{cta("see-how")}</OnBoxGhostButton>
          </div>
          <p
            className="hero-rise mt-7 inline-flex items-center gap-2 text-sm text-on-navy/70"
            style={{ animationDelay: "240ms" }}
          >
            <span className="size-1.5 rounded-full bg-sage" />
            {t("hero-cred")}
          </p>
        </div>
        <div
          className="hero-rise mx-auto mt-14 w-full max-w-4xl"
          style={{ animationDelay: "300ms" }}
        >
          <ReviewMock copy={mockCopy} fields={mockFields} className="shadow-lg" />
        </div>
      </HeroBox>

      {/* How it works strip */}
      <Band>
        <Reveal>
          <SectionHead
            center
            eyebrow={t("steps-eyebrow")}
            title={t("steps-title")}
          />
        </Reveal>
        <Reveal delay={80}>
          <StepList steps={steps} columns={3} className="mt-12" />
        </Reveal>
      </Band>

      {/* Coverage band */}
      <Band>
        <Reveal>
          <Well>
            <Eyebrow className="mb-3">{t("coverage-eyebrow")}</Eyebrow>
            <h2 className="title-tracking text-h3 text-ink">{t("coverage-title")}</h2>
            <div className="mt-8">
              <InsurerChips />
            </div>
            <p className="mt-6 max-w-[70ch] text-sm text-muted-foreground">{t("coverage-note")}</p>
            <ArrowLink href="/insurers" className="mt-4">
              {t("coverage-link")}
            </ArrowLink>
          </Well>
        </Reveal>
      </Band>

      {/* Proof band (accent panel) */}
      <Band>
        <Reveal>
          <Panel tone="accent">
            <Eyebrow tone="on-panel" className="mb-3">
              {t("proof-eyebrow")}
            </Eyebrow>
            <h2 className="max-w-[20ch] text-h2 text-on-navy">{t("proof-title")}</h2>
            <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
              <div>
                <p className="text-h3 text-on-navy">{t("proof1-title")}</p>
                <p className="mt-2 text-sm text-on-navy/80">{t("proof1-body")}</p>
              </div>
              <div>
                <p className="text-h3 text-on-navy">{t("proof2-title")}</p>
                <p className="mt-2 text-sm text-on-navy/80">{t("proof2-body")}</p>
              </div>
              <div>
                <p className="text-h3 text-on-navy">{t("proof3-title")}</p>
                <p className="mt-2 text-sm text-on-navy/80">{t("proof3-body")}</p>
              </div>
            </div>
            <ArrowLink href="/customers" className="mt-10" onDark>
              {t("proof-link")}
            </ArrowLink>

            {/* Data-residency trust row — folded into the proof panel so the
                statement reads as part of "why clinics trust it" rather than
                an orphan strip between boxes. */}
            <div className="mt-10 flex flex-wrap items-center gap-4 border-t border-on-navy/15 pt-6">
              <span className="inline-flex size-10 flex-none items-center justify-center rounded-card bg-on-navy/10 text-on-navy">
                <ShieldCheckIcon className="size-5" />
              </span>
              <p className="min-w-64 flex-1 text-sm text-on-navy/85">
                {t("trust-line")}
              </p>
              <OnBoxGhostButton href="/security" size="md">
                {t("trust-cta")}
              </OnBoxGhostButton>
            </div>
          </Panel>
        </Reveal>
      </Band>

      <ClosingCta secondary="demo" />
    </>
  );
}
