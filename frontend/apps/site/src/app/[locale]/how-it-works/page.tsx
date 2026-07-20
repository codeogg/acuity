import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  ArrowLink,
  Band,
  Eyebrow,
  InfoCard,
  OnBoxGhostButton,
  PageHero,
  Panel,
  SectionHead,
  StepList,
  Well,
  type Step,
} from "@/components/marketing";
import { Reveal } from "@/components/reveal";
import { WhatsAppButton } from "@/components/handoff";
import { ReviewMock, type ReviewMockCopy, type MockField } from "@/components/review-mock";
import { ClosingCta } from "@/components/closing-cta";
import { WHATSAPP } from "@/lib/channels";
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
    path: "/how-it-works",
    title: t("how-it-works.title"),
    description: t("how-it-works.description"),
  });
}

export default async function HowItWorksPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("how-it-works");
  const m = await getTranslations("mock");
  const cta = await getTranslations("cta");

  const workflow: Step[] = [
    { num: "01", title: t("wf1-title"), body: t("wf1-body") },
    { num: "02", title: t("wf2-title"), body: t("wf2-body") },
    { num: "03", title: t("wf3-title"), body: t("wf3-body") },
    { num: "04", title: t("wf4-title"), body: t("wf4-body") },
    { num: "05", title: t("wf5-title"), body: t("wf5-body") },
  ];
  const work: Step[] = [
    { num: "01", title: t("work1-title"), body: t("work1-body") },
    { num: "02", title: t("work2-title"), body: t("work2-body") },
    { num: "03", title: t("work3-title"), body: t("work3-body") },
    { num: "04", title: t("work4-title"), body: t("work4-body") },
    { num: "05", title: t("work5-title"), body: t("work5-body") },
  ];

  const mockCopy: ReviewMockCopy = {
    panelLabel: m("panel-label"),
    chip: t("mock-chip"),
    synthetic: m("synthetic"),
    sourceHead: m("source-head"),
    linkedLabel: m("linked"),
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
      ],
      [{ text: t("mock-source3") }],
    ],
  };
  const mockFields: MockField[] = [
    {
      category: t("mock-patient-cat"),
      label: t("mock-patient-name"),
      value: t("mock-patient-name-value"),
      status: "confirmed",
    },
    {
      category: t("mock-clinical-cat"),
      label: t("mock-primary-diagnosis"),
      value: t("mock-primary-diagnosis-value"),
      status: "drafted",
      linked: true,
    },
    {
      label: t("mock-admission"),
      value: t("mock-admission-value"),
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

  return (
    <>
      {/* Hero */}
      <PageHero
        eyebrow={t("hero-eyebrow")}
        title={t("hero-title")}
        lede={t("hero-lede")}
      >
        <div className="flex flex-wrap items-center justify-center gap-3">
          <WhatsAppButton href={WHATSAPP} onBox>
            {cta("whatsapp")}
          </WhatsAppButton>
          <OnBoxGhostButton href="/insurers">{t("hero-link")}</OnBoxGhostButton>
        </div>
      </PageHero>

      {/* Workflow steps */}
      <Band>
        <Reveal>
          <SectionHead
            center
            eyebrow={t("workflow-eyebrow")}
            title={t("workflow-title")}
          />
        </Reveal>
        <Reveal delay={80}>
          <StepList steps={workflow} columns={5} className="mt-12" />
        </Reveal>
      </Band>

      {/* Synthetic figure */}
      <Band>
        <Well>
          <SectionHead
            eyebrow={t("figure-eyebrow")}
            title={t("figure-title")}
            className="mb-6"
          />
          <ReviewMock copy={mockCopy} fields={mockFields} />
          <p className="mt-4 text-xs text-muted-foreground">{t("figure-caption")}</p>
        </Well>
      </Band>

      {/* You stay in command */}
      <Band>
        <div className="grid grid-cols-1 gap-10">
          <SectionHead
            eyebrow={t("command-eyebrow")}
            title={t("command-title")}
            lede={t("command-lede")}
            className="max-w-none"
          />
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <InfoCard title={t("cmd1-title")}>{t("cmd1-body")}</InfoCard>
            <InfoCard title={t("cmd2-title")}>{t("cmd2-body")}</InfoCard>
            <InfoCard title={t("cmd3-title")}>{t("cmd3-body")}</InfoCard>
          </div>
        </div>
      </Band>

      {/* Honest ROI (venice panel) */}
      <Band>
        <Panel tone="venice">
          <Eyebrow tone="on-panel" className="mb-3">
            {t("roi-eyebrow")}
          </Eyebrow>
          <h2 className="max-w-[22ch] text-h2 text-on-navy">{t("roi-title")}</h2>
          <p className="mt-4 max-w-[52ch] text-body-lg text-on-navy/85">
            {t("roi-body")}
          </p>
        </Panel>
      </Band>

      {/* How we work together */}
      <Band>
        <Well>
          <SectionHead eyebrow={t("work-eyebrow")} title={t("work-title")} />
          <StepList steps={work} columns={5} titleSize="xl" bodySize="sm" className="mt-10" />

          <div className="mt-12 grid grid-cols-1 gap-6 cards:grid-cols-2">
            <InfoCard eyebrow={t("cost-eyebrow")} bodySize="md">
              {t("cost-body")}
            </InfoCard>
            <InfoCard eyebrow={t("obligation-eyebrow")} bodySize="md">
              {t("obligation-body")}
            </InfoCard>
            <InfoCard eyebrow={t("data-eyebrow")} bodySize="md">
              <span>{t("data-body-pre")}</span>
              <ArrowLink href="/security" className="align-baseline">
                {t("data-link")}
              </ArrowLink>
            </InfoCard>
            <InfoCard eyebrow={t("forms-eyebrow")} bodySize="md">
              <span>{t("forms-body-pre")}</span>
              <ArrowLink href="/insurers" className="align-baseline">
                {t("forms-link")}
              </ArrowLink>
            </InfoCard>
          </div>

          <Panel tone="accent" className="mt-10">
            <Eyebrow tone="on-panel" className="mb-3">
              {t("no-price-eyebrow")}
            </Eyebrow>
            <p className="max-w-[60ch] text-body-lg text-on-navy">
              {t("no-price-body")}
            </p>
          </Panel>
        </Well>
      </Band>

      <ClosingCta secondary="contact" />
    </>
  );
}
