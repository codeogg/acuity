// The operator-console shell — the shared AcuityShell console variant
// (overview.md finalised shell): 248px cream sidebar on the same ground as the
// work area (icon rail at md–lg, hidden below md per the shared responsive
// grammar), three static sections (OPERATIONS / LIBRARY / INSIGHTS) with
// per-item counts, bottom identity block (operator name + active RBAC role)
// as the account-menu bar, and the server-rendered impersonation signal above
// all chrome. Below md the console adopts the app grammar: a floating mobile
// top bar (brand + account menu) plus a bottom tab bar carrying the four
// primary destinations and a "more" menu for the rest of the nav. Server
// component; counts and the impersonation session are fetched per request
// from the mock backend.

import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { AcuityShell, type ShellNavItem, type ShellNavSection } from "@acuity/ui";
import { getNavCounts } from "@/lib/data";
import { getOperatorProfile } from "@/lib/ops-model";
import { AcuityIcon, type AcuityIconName } from "@acuity/ui";
import { ImpersonationBanner } from "@/components/system/impersonation-banner";
import { ShellFooter } from "@/components/shell/shell-footer";

function item(
  href: string,
  icon: AcuityIconName,
  label: string,
  count?: number,
  exact = false,
): ShellNavItem {
  // The shared ShellNavItem carries the count chip natively.
  return { href, label, count, icon: <AcuityIcon name={icon} size={18} />, exact };
}

export async function ConsoleShell({ locale, children }: { locale: string; children: ReactNode }) {
  const t = await getTranslations("nav");
  const counts = await getNavCounts().catch(() => null);
  const operator = getOperatorProfile();
  // Hrefs handed to @acuity/ui components carry the locale explicitly — the
  // shared shell renders plain next/link (the package is i18n-neutral). App
  // components rendering their own links use the @acuity/i18n/navigation
  // wrappers with locale-free paths instead.
  const p = (path: string) => `/${locale}${path}`;

  const sections: ShellNavSection[] = [
    {
      heading: t("section.operations"),
      items: [
        item(`/${locale}`, "dashboard", t("item.dashboard"), undefined, true),
        item(p("/clinics"), "clinic", t("item.clinics"), counts?.clinics),
        item(p("/doctors"), "doctor", t("item.doctors"), counts?.doctors),
        item(p("/tickets"), "ticket", t("item.tickets"), counts?.tickets),
        item(p("/claims"), "claim", t("item.claims")),
      ],
    },
    {
      heading: t("section.library"),
      items: [
        item(p("/forms"), "template", t("item.forms"), counts?.forms),
        item(p("/tags"), "tag", t("item.tags")),
        item(p("/insurers"), "shield-check", t("item.insurers")),
        item(p("/standard-fields"), "field", t("item.standard-fields")),
      ],
    },
    {
      heading: t("section.insights"),
      items: [
        item(p("/audit"), "audit", t("item.audit")),
        item(p("/analytics"), "chart", t("item.analytics")),
      ],
    },
  ];

  // Bottom tab set (<md): the four primary destinations as flat-label tabs
  // (no count chips at tab density); everything else sits behind the trailing
  // "more" menu, which the shell derives from the sections by href.
  const tabBar: ShellNavItem[] = [
    { href: `/${locale}`, label: t("item.dashboard"), icon: <AcuityIcon name="dashboard" size={20} />, exact: true },
    { href: p("/clinics"), label: t("item.clinics"), icon: <AcuityIcon name="clinic" size={20} /> },
    { href: p("/doctors"), label: t("item.doctors"), icon: <AcuityIcon name="doctor" size={20} /> },
    { href: p("/tickets"), label: t("item.tickets"), icon: <AcuityIcon name="ticket" size={20} /> },
  ];

  return (
    <AcuityShell
      variant="console"
      brand="Acuity"
      sections={sections}
      banner={<ImpersonationBanner locale={locale} />}
      skipLabel={t("skip")}
      navLabel={t("primary")}
      topBar={
        // Mobile top bar (<md): the floating-capsule grammar shared with the
        // doctor app — brand wordmark plus the account menu (Preferences,
        // language, sign out), which the hidden sidebar can no longer carry.
        <header className="shrink-0 px-3 pt-3 md:hidden">
          <div className="flex items-center justify-between rounded-lg bg-sidebar px-4 py-1.5 shadow-[var(--elevation-raised)]">
            <span className="select-none font-title text-lg font-semibold text-primary">
              Acuity
            </span>
            <div className="flex w-11 justify-center">
              <ShellFooter
                locale={locale}
                operatorName={operator.name}
                operatorRole={operator.role}
                compact
              />
            </div>
          </div>
        </header>
      }
      tabBar={tabBar}
      tabBarMore={{ label: t("item.more"), icon: <AcuityIcon name="dots" size={20} /> }}
      footer={
        <>
          <div className="hidden lg:block">
            <ShellFooter
              locale={locale}
              operatorName={operator.name}
              operatorRole={operator.role}
            />
          </div>
          <div className="lg:hidden">
            <ShellFooter
              locale={locale}
              operatorName={operator.name}
              operatorRole={operator.role}
              compact
            />
          </div>
        </>
      }
    >
      {children}
    </AcuityShell>
  );
}
