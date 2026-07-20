import Link from "next/link";
import { createTranslator } from "next-intl";
import { defaultLocale } from "@acuity/i18n";
import messages from "../../messages/en-HK.json";
import "./globals.css";

// Global fallback for requests that never reach a locale segment. It renders
// under the bare root layout (which emits no <html>), so it provides its own
// document shell. No locale is known here, so it renders the default locale's
// catalog strings; locale-scoped 404s use [locale]/not-found.tsx, which is
// fully translated and framed by the site chrome.
export default function GlobalNotFound() {
  const t = createTranslator({
    locale: defaultLocale,
    messages,
    namespace: "not-found",
  });
  return (
    <html lang={defaultLocale}>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-6 text-center">
          <p className="font-mono text-xs font-medium uppercase tracking-eyebrow text-muted-foreground">
            {t("eyebrow")}
          </p>
          <h1 className="mt-4 text-4xl font-semibold text-ink [font-family:var(--font-title)]">
            {t("root-title")}
          </h1>
          <p className="mt-4 text-lg text-ink-muted">{t("root-lede")}</p>
          <Link
            href={`/${defaultLocale}`}
            className="mt-8 inline-flex h-12 items-center justify-center rounded-md bg-navy px-6 text-base font-medium text-on-navy transition-colors hover:bg-navy-bright"
          >
            {t("root-home")}
          </Link>
        </main>
      </body>
    </html>
  );
}
