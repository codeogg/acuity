import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Band, PageHero } from "@/components/marketing";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return {
    ...pageMetadata({ locale, path: "/terms", title: t("terms.title") }),
    robots: { index: true },
  };
}

export default async function TermsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("legal");

  const sections = [
    { title: t("terms1-title"), body: t("terms1-body") },
    { title: t("terms2-title"), body: t("terms2-body") },
    { title: t("terms3-title"), body: t("terms3-body") },
  ];

  return (
    <>
      <PageHero eyebrow={t("eyebrow")} title={t("terms-title")} lede={t("terms-note")} />
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
        </div>
      </Band>
    </>
  );
}
