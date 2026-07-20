"use client";

import { useTranslations } from "next-intl";
import { GlobeIcon } from "@acuity/ui";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { HandoffLink } from "@/components/handoff";
import { WHATSAPP, CALENDLY, EMAIL, type HandoffKind } from "@/lib/channels";

// Navy footer (caliber navy ground, cream text). Wordmark set in the title face,
// four link columns, presence line, and a locale toggle in the baseline row.
// Concierge channels (WhatsApp / demo / email) route through the calm hand-off
// toast before opening off-site.

function Column({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="mb-3 font-mono text-xs font-medium uppercase tracking-eyebrow text-on-navy/70">
        {title}
      </h2>
      <ul className="flex flex-col gap-2">{children}</ul>
    </div>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <Link
        href={href}
        className="text-sm text-on-navy/80 underline-offset-4 transition-colors hover:text-on-navy hover:underline active:text-sky-blue"
      >
        {children}
      </Link>
    </li>
  );
}

function ChannelLink({
  kind,
  href,
  children,
}: {
  kind: HandoffKind;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <li>
      <HandoffLink
        kind={kind}
        href={href}
        className="text-sm text-on-navy/80 underline-offset-4 transition-colors hover:text-on-navy hover:underline active:text-sky-blue"
      >
        {children}
      </HandoffLink>
    </li>
  );
}

export function SiteFooter({ locale }: { locale: string }) {
  const t = useTranslations("footer");
  const nav = useTranslations("nav");
  const pathname = usePathname();
  const router = useRouter();
  const nextLocale = locale.startsWith("zh") ? "en-HK" : "zh-Hant-HK";
  const toggleLabel = locale.startsWith("zh") ? "English" : "繁體中文";

  return (
    <footer className="bg-cream px-frame pb-frame">
      <div className="ground-dark rounded-box bg-navy text-on-navy">
        <div className="mx-auto max-w-shell px-6 pb-12 pt-18 md:px-10 lg:px-14">
        <div className="grid grid-cols-1 gap-12 md:grid-cols-[1.4fr_2fr]">
          <div>
            <Link
              href="/"
              className="font-title text-2xl leading-none tracking-title text-on-navy"
            >
              Acuity
            </Link>
            <p className="mt-3 max-w-[30ch] text-sm text-on-navy/70">{t("tagline")}</p>
            <p className="mt-4 text-sm text-on-navy/70">{t("presence")}</p>
          </div>

          <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
            <Column title={t("col-product")}>
              <FooterLink href="/how-it-works">{nav("how-it-works")}</FooterLink>
              <FooterLink href="/insurers">{nav("insurers")}</FooterLink>
              <FooterLink href="/security">{nav("security")}</FooterLink>
            </Column>
            <Column title={t("col-company")}>
              <FooterLink href="/about">{nav("about")}</FooterLink>
              <FooterLink href="/customers">{nav("customers")}</FooterLink>
            </Column>
            <Column title={t("col-talk")}>
              <ChannelLink kind="whatsapp" href={WHATSAPP}>
                {t("whatsapp")}
              </ChannelLink>
              <ChannelLink kind="demo" href={CALENDLY}>
                {t("book-demo")}
              </ChannelLink>
              <ChannelLink kind="email" href={EMAIL}>
                {t("email")}
              </ChannelLink>
            </Column>
            <Column title={t("col-legal")}>
              <FooterLink href="/privacy">{t("privacy")}</FooterLink>
              <FooterLink href="/terms">{t("terms")}</FooterLink>
            </Column>
          </div>
        </div>

        <div className="mt-16 flex flex-wrap items-center justify-between gap-4 border-t border-on-navy/[0.14] pt-6 text-sm text-on-navy/60">
          <span>{t("rights")}</span>
          <button
            type="button"
            onClick={() => router.replace(pathname, { locale: nextLocale })}
            className="inline-flex min-h-11 items-center gap-1 text-on-navy/85 transition-colors hover:text-sky-blue"
          >
            <GlobeIcon className="size-4" />
            <span>{toggleLabel}</span>
          </button>
        </div>
        </div>
      </div>
    </footer>
  );
}
