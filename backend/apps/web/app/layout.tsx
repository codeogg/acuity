import type { Metadata } from "next";
import { cookies } from "next/headers";

import { DEFAULT_LOCALE, isAppLocale } from "@/lib/i18n/types";
import { Providers } from "./providers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const storedLocale = (await cookies()).get("locale")?.value;
  const english = storedLocale === "en-HK";
  return {
    title: english ? "Smart Insurance Form System" : "保單智能填報系統",
    description: english
      ? "Smart insurance form system for Hong Kong clinics"
      : "香港診所保險保單智能填報系統",
  };
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const storedLocale = (await cookies()).get("locale")?.value;
  const locale = isAppLocale(storedLocale) ? storedLocale : DEFAULT_LOCALE;
  return (
    <html lang={locale}>
      <body>
        <Providers initialLocale={locale}>{children}</Providers>
      </body>
    </html>
  );
}
