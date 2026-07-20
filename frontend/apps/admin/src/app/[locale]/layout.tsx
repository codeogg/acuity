import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { acuityFontVariables } from "@acuity/ui/fonts";
import { routing } from "@/i18n/routing";
import { ToastProvider } from "@acuity/ui";

// The console renders per request against the stateful (mock or live) backend:
// nav counts, the impersonation signal and every grid are request-time data,
// so nothing in the locale tree is prerendered at build. The authenticated
// console chrome lives in the (console) group layout; the (auth) group carries
// the chrome-free sign-in journey.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return { title: t("title") };
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
  return (
    <html lang={locale} className={acuityFontVariables}>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <NextIntlClientProvider>
          <ToastProvider>{children}</ToastProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
