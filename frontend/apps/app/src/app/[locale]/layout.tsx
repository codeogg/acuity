import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { acuityFontVariables } from "@acuity/ui/fonts";
import { routing } from "@/i18n/routing";
import { MockBootstrap } from "@/components/providers/mock-bootstrap";

// Pre-render both locales at build time.
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "app" });
  return { title: t("name") };
}

// The locale shell shared by BOTH route groups: the authenticated app
// surfaces under (app) and the public sign-in under (auth). Only what both
// need lives here (html/body, fonts, messages, the mock worker gate); the
// signed-in chrome (session, shell, overlays) belongs to (app)/layout.
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
  // Enable static rendering for this locale.
  setRequestLocale(locale);

  return (
    <html lang={locale} className={acuityFontVariables}>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <NextIntlClientProvider>
          <MockBootstrap>{children}</MockBootstrap>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
