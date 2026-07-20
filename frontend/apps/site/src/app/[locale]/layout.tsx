import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { acuityFontVariables } from "@acuity/ui/fonts";
import { routing } from "@/i18n/routing";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { LocaleSuggestion } from "@/components/locale-suggestion";
import { ConsentBanner } from "@/components/consent-banner";
import { HandoffToast } from "@/components/handoff";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

// Layout-level fallback title: every page carries its own generateMetadata;
// this covers the routes that cannot (the not-found boundary).
export function generateMetadata() {
  return { title: "Acuity" };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);
  const nav = await getTranslations("nav");

  return (
    <html lang={locale} className={acuityFontVariables}>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <NextIntlClientProvider>
          <a
            href="#main"
            className="sr-only z-(--z-skip-link) rounded-md bg-navy px-4 py-2 text-on-navy focus:not-sr-only focus:absolute focus:left-3 focus:top-3"
          >
            {nav("skip")}
          </a>
          <div className="relative flex min-h-screen flex-col">
            <SiteHeader locale={locale} />
            {/* Uniform section rhythm: one flex gap between every boxed band,
                and the same distance again before the footer (pb). */}
            <main id="main" className="flex flex-1 flex-col gap-band pb-band">
              {children}
            </main>
            <SiteFooter locale={locale} />
          </div>
          <LocaleSuggestion locale={locale} />
          <ConsentBanner />
          <HandoffToast />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
