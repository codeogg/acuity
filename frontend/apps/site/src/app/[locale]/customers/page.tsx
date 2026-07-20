import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  Band,
  Eyebrow,
  PageHero,
  Panel,
  SectionHead,
  Well,
} from "@/components/marketing";
import { Reveal } from "@/components/reveal";
import { ClosingCta } from "@/components/closing-cta";
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
    path: "/customers",
    title: t("customers.title"),
    description: t("customers.description"),
  });
}

export default async function CustomersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("customers");
  const cta = await getTranslations("cta");

  const quotes = [
    { eyebrow: t("quote1-eyebrow"), quote: t("quote1"), author: t("quote1-author") },
    { eyebrow: t("quote2-eyebrow"), quote: t("quote2"), author: t("quote2-author") },
    { eyebrow: t("quote3-eyebrow"), quote: t("quote3"), author: t("quote3-author") },
  ];
  const floor = [
    { title: t("floor1-title"), body: t("floor1-body") },
    { title: t("floor2-title"), body: t("floor2-body") },
    { title: t("floor3-title"), body: t("floor3-body") },
  ];

  return (
    <>
      <PageHero
        eyebrow={t("hero-eyebrow")}
        title={t("hero-title")}
        lede={t("hero-lede")}
      />

      {/* Peer proof */}
      <Band>
        <Reveal>
          <SectionHead center eyebrow={t("proof-eyebrow")} title={t("proof-title")} />
        </Reveal>
        <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
          {quotes.map((q) => (
            <div key={q.author} className="rounded-card border border-border bg-card p-6">
              <Eyebrow>{q.eyebrow}</Eyebrow>
              <p className="mt-3 text-body-lg text-ink">{q.quote}</p>
              <p className="mt-4 text-sm text-muted-foreground">{q.author}</p>
            </div>
          ))}
        </div>

        {/* minimum viable proof floor */}
        <Well className="mt-12">
          <Eyebrow>{t("floor-eyebrow")}</Eyebrow>
          <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-3">
            {floor.map((f) => (
              <div key={f.title}>
                <p className="font-title text-h3 text-ink">{f.title}</p>
                <p className="mt-2 text-sm text-ink-muted">{f.body}</p>
              </div>
            ))}
          </div>
        </Well>
      </Band>

      {/* Affiliation strip (accent panel) */}
      <Band>
        <Panel tone="accent">
          <Eyebrow tone="on-panel">{t("affiliation-eyebrow")}</Eyebrow>
          <div className="mt-6 flex flex-wrap gap-4">
            {["HKMA", "HKCFP", t("affiliation-events")].map((mark) => (
              <span
                key={mark}
                className="inline-flex items-center rounded-md border border-on-navy/[0.22] bg-on-navy/[0.12] px-5 py-3 font-title font-semibold text-on-navy"
              >
                {mark}
              </span>
            ))}
          </div>
          <p className="mt-6 text-sm text-on-navy/80">{t("affiliation-note")}</p>
        </Panel>
      </Band>

      <ClosingCta title={cta("call-title-customers")} lede="" />
    </>
  );
}
