import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Band, ArrowLink, PageHero } from "@/components/marketing";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return {
    ...pageMetadata({ locale, path: "/privacy", title: t("privacy.title") }),
    robots: { index: true },
  };
}

export default async function PrivacyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("legal");

  const sections = [
    { title: t("privacy1-title"), body: t("privacy1-body") },
    { title: t("privacy2-title"), body: t("privacy2-body") },
    { title: t("privacy3-title"), body: t("privacy3-body") },
  ];

  return (
    <>
    <PageHero eyebrow={t("eyebrow")} title={t("privacy-title")} lede={t("privacy-note")} />
    <Band>
      <div className="mx-auto max-w-3xl">
        <div className="flex flex-col gap-6 text-ink-muted">
          {sections.map((s) => (
            <div key={s.title}>
              <h2 className="font-title text-h3 text-ink">{s.title}</h2>
              <p className="mt-2">{s.body}</p>
            </div>
          ))}
        </div>
        <p className="mt-12">
          <ArrowLink href="/security">{t("trust-link")}</ArrowLink>
        </p>
      </div>
    </Band>
    </>
  );
}
