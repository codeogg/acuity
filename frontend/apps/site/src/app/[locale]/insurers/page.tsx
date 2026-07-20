import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  Band,
  Eyebrow,
  OnFillButton,
  PageHero,
  Panel,
  SecondaryButton,
  Well,
} from "@/components/marketing";
import { Reveal } from "@/components/reveal";
import { WhatsAppButton } from "@/components/handoff";
import { InsurerCards } from "@/components/coverage";
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
    path: "/insurers",
    title: t("insurers.title"),
    description: t("insurers.description"),
  });
}

export default async function InsurersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("insurers");
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

      <Band>
        <Reveal>
          <InsurerCards locale={locale} />
          <p className="mt-10 max-w-[60ch] text-sm text-muted-foreground">{t("grid-note")}</p>
        </Reveal>
      </Band>

      <Band>
        <Well className="grid grid-cols-1 gap-6">
          <div className="max-w-[62ch]">
            <Eyebrow className="mb-3">{t("not-listed-eyebrow")}</Eyebrow>
            <h2 className="title-tracking text-h3 text-ink">{t("not-listed-title")}</h2>
            <p className="mt-3 max-w-[60ch] text-ink-muted">{t("not-listed-lede")}</p>
          </div>
          <div>
            <SecondaryButton href="/contact">{t("not-listed-cta")}</SecondaryButton>
          </div>
        </Well>
      </Band>

      <Band>
        <Panel
          tone="accent"
          className="flex flex-wrap items-center justify-between gap-6"
        >
          <div>
            <Eyebrow tone="on-panel" className="mb-2">
              {t("how-eyebrow")}
            </Eyebrow>
            <h2 className="max-w-[24ch] text-h3 text-on-navy">{t("how-title")}</h2>
          </div>
          <OnFillButton href="/how-it-works">{t("how-cta")}</OnFillButton>
        </Panel>
      </Band>

      <ClosingCta title={cta("call-title-insurer")} lede="" />
    </>
  );
}
