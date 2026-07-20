import Link from "next/link";
import { createTranslator } from "next-intl";
import { defaultLocale } from "@acuity/i18n";
import messages from "../../messages/en-HK.json";
import "./globals.css";

// Global fallback for requests that never reach a locale segment. It renders
// under the bare root layout (which emits no <html>), so it provides its own
// document shell. No locale is known here, so it renders the default locale's
// catalog strings; locale-scoped 404s use [locale]/not-found.tsx, which is
// fully translated.
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
          <h1 className="font-title text-3xl font-semibold text-foreground">
            {t("title")}
          </h1>
          <p className="mt-4 text-base text-muted-foreground">{t("body")}</p>
          <Link
            href={`/${defaultLocale}`}
            className="mt-8 inline-flex h-11 items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-[var(--color-action-bg-hover)]"
          >
            {t("action")}
          </Link>
        </main>
      </body>
    </html>
  );
}
