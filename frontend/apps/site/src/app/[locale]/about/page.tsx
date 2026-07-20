import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  Band,
  Eyebrow,
  InfoCard,
  PageHero,
  Panel,
  SectionHead,
  Well,
} from "@/components/marketing";
import { Reveal } from "@/components/reveal";
import { WhatsAppButton } from "@/components/handoff";
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
    path: "/about",
    title: t("about.title"),
    description: t("about.description"),
  });
}

export default async function AboutPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("about");
  const cta = await getTranslations("cta");

  return (
    <>
      <PageHero
        eyebrow={t("hero-eyebrow")}
        title={t("hero-title")}
        lede={t("hero-lede")}
      >
        <div className="flex flex-wrap items-center justify-center gap-3">
          <WhatsAppButton href={WHATSAPP} onBox>
            {cta("whatsapp")}
          </WhatsAppButton>
        </div>
      </PageHero>

      {/* HK presence */}
      <Band>
        <Reveal>
          <SectionHead
            center
            eyebrow={t("presence-eyebrow")}
            title={t("presence-title")}
          />
        </Reveal>
        <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
          <InfoCard title={t("presence1-title")}>{t("presence1-body")}</InfoCard>
          <InfoCard title={t("presence2-title")}>{t("presence2-body")}</InfoCard>
          <InfoCard title={t("presence3-title")}>{t("presence3-body")}</InfoCard>
        </div>
      </Band>

      {/* Mission (accent panel) */}
      <Band>
        <Panel tone="accent" center>
          <Eyebrow tone="on-panel">{t("mission-eyebrow")}</Eyebrow>
          <h2 className="mx-auto mt-4 max-w-[24ch] text-h2 text-on-navy">
            {t("mission-title")}
          </h2>
        </Panel>
      </Band>

      {/* Trust signals */}
      <Band>
        <Well>
          <Eyebrow>{t("trust-eyebrow")}</Eyebrow>
          <div className="mt-6 flex flex-wrap items-center gap-4">
            {["HKMA", "HKCFP"].map((mark) => (
              <span
                key={mark}
                className="inline-flex items-center rounded-md border border-border px-5 py-3 font-title font-semibold text-navy"
              >
                {mark}
              </span>
            ))}
            <span className="inline-flex items-center rounded-md border border-border px-5 py-3 text-ink">
              {t("trust-hk")}
            </span>
          </div>
        </Well>
      </Band>

      <ClosingCta title={t("closing-title")} lede="" />
    </>
  );
}
