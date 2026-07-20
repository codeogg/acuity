import Link from "next/link";
import { setRequestLocale } from "next-intl/server";
import { getTranslations } from "next-intl/server";

// Public harness home — quick links into both journeys and their states,
// grouped and laid out as a comfortable card grid (not a compressed column).
export default async function HarnessHome({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("harness");

  const groups: Array<{ title: string; links: Array<{ href: string; label: string }> }> = [
    {
      title: "Journeys",
      links: [
        { href: `/${locale}/sign-in`, label: t("doctorSignIn") },
        { href: `/${locale}/operator/sign-in`, label: t("operatorSignIn") },
        { href: `/${locale}/sign-in?demo-account=dr2188`, label: "single-clinic doctor" },
        { href: `/${locale}/sign-in?demo-mfa=fail`, label: "MFA-enabled doctor (step-up)" },
      ],
    },
    {
      title: "States",
      links: [
        { href: `/${locale}/sign-in?demo-account=nobody`, label: "wrong credentials" },
        { href: `/${locale}/sign-in?demo-account=dr.locked`, label: "locked account" },
        { href: `/${locale}/sign-in?demo-mfa=expired`, label: "MFA expired" },
        { href: `/${locale}/sign-in?reason=expired`, label: "session expired" },
        { href: `/${locale}/sign-in?demo-scenario=slow-network`, label: "latency / long wait" },
        { href: `/${locale}/sign-in?demo-scenario=network-error`, label: "network error" },
        { href: `/${locale}/operator/sign-in?demo-account=dr2207`, label: "wrong-app session (console)" },
      ],
    },
    {
      title: "Protected destinations",
      links: [
        { href: `/${locale}/forms`, label: "work home (deep-link return)" },
        { href: `/${locale}/clinics`, label: "clinics portfolio" },
      ],
    },
  ];

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <h1 className="auth-heading">{t("homeTitle")}</h1>
      <p className="mt-2 max-w-[70ch] text-base text-foreground">{t("homeLede")}</p>
      <div className="mt-8 flex flex-col gap-8">
        {groups.map((group) => (
          <section key={group.title}>
            <h2 className="font-mono text-xs font-medium uppercase tracking-widest text-muted-foreground">
              {group.title}
            </h2>
            <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {group.links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="block rounded-md border border-border bg-card px-4 py-3 text-sm text-foreground transition-colors hover:bg-accent"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}
