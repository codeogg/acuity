import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CalendarIcon, MailIcon, WhatsAppIcon } from "@acuity/ui";
import { Band, Eyebrow, PageHero, Panel } from "@/components/marketing";
import { HandoffButton } from "@/components/handoff";
import { Link } from "@/i18n/navigation";
import { WHATSAPP, CALENDLY, EMAIL, type HandoffKind } from "@/lib/channels";
import { pageMetadata } from "@/lib/seo";

// Phase 1 contact is channels-only: the three concierge links, no submittable
// form (the page is static and cookie-less by design). A future intake form is
// a separate, deliberate product step.

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return pageMetadata({
    locale,
    path: "/contact",
    title: t("contact.title"),
    description: t("contact.description"),
  });
}

function ChannelCard({
  icon,
  title,
  body,
  cta,
  href,
  kind,
  tier,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  cta: string;
  href: string;
  kind: HandoffKind;
  tier: "primary" | "secondary" | "ghost";
}) {
  const iconWrap =
    tier === "primary" ? "bg-navy/[0.06] text-navy" : "bg-glaucous/[0.12] text-venice";
  return (
    <div className="flex flex-col gap-4 rounded-card border border-border bg-card p-6">
      <span
        className={`inline-flex size-11 items-center justify-center rounded-card ${iconWrap}`}
      >
        {icon}
      </span>
      <div>
        <h2 className="font-title text-title-sm text-ink">{title}</h2>
        <p className="mt-2 text-sm text-ink-muted">{body}</p>
      </div>
      <HandoffButton kind={kind} href={href} tier={tier} className="mt-auto">
        {cta}
      </HandoffButton>
    </div>
  );
}

export default async function ContactPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("contact");

  return (
    <>
      <PageHero
        eyebrow={t("hero-eyebrow")}
        title={t("hero-title")}
        lede={t("hero-lede")}
      />

      {/* Channels */}
      <Band>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <ChannelCard
            icon={<WhatsAppIcon className="size-5.5" />}
            title={t("whatsapp-title")}
            body={t("whatsapp-body")}
            cta={t("whatsapp-cta")}
            href={WHATSAPP}
            kind="whatsapp"
            tier="primary"
          />
          <ChannelCard
            icon={<CalendarIcon className="size-5.5" />}
            title={t("demo-title")}
            body={t("demo-body")}
            cta={t("demo-cta")}
            href={CALENDLY}
            kind="demo"
            tier="secondary"
          />
          <ChannelCard
            icon={<MailIcon className="size-5.5" />}
            title={t("email-title")}
            body={t("email-body")}
            cta={t("email-cta")}
            href={EMAIL}
            kind="email"
            tier="ghost"
          />
        </div>
        <p className="mt-6 max-w-[60ch] text-sm text-muted-foreground">{t("channel-note")}</p>
      </Band>

      {/* Objection pre-emption (accent panel) */}
      <Band>
        <Panel tone="accent">
          <Eyebrow tone="on-panel">{t("objection-eyebrow")}</Eyebrow>
          <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-3">
            <div>
              <p className="text-xl leading-tight text-on-navy">{t("obj-cost-title")}</p>
              <p className="mt-2 text-sm text-on-navy/85">{t("obj-cost-body")}</p>
            </div>
            <div>
              <p className="text-xl leading-tight text-on-navy">
                {t("obj-obligation-title")}
              </p>
              <p className="mt-2 text-sm text-on-navy/85">{t("obj-obligation-body")}</p>
            </div>
            <div>
              <p className="text-xl leading-tight text-on-navy">{t("obj-data-title")}</p>
              <p className="mt-2 text-sm text-on-navy/85">
                <span>{t("obj-data-pre")}</span>
                <Link href="/security" className="text-cream underline">
                  {t("obj-data-link")}
                </Link>
              </p>
            </div>
          </div>
        </Panel>
      </Band>
    </>
  );
}
