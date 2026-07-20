"use client";

import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import {
  AcuityShell,
  CheckCircleIcon,
  ClockIcon,
  FilePlusIcon,
  HelpIcon,
  PlusIcon,
  SettingsIcon,
  ShellAccountMenu,
  SignOutIcon,
  UsersIcon,
  type ShellNavSection,
} from "@acuity/ui";
import { SignOutButton, signOut } from "@acuity/auth-ui";
import type { Locale } from "@/i18n/routing";
import { useSession } from "@/lib/session";
import { localeName } from "@acuity/i18n/names";
import { useToast } from "@acuity/ui";
import { Avatar } from "@acuity/ui";
import { LanguageToggle } from "./language-toggle";

// The doctor-app shell over the shared AcuityShell (overview.md §Finalised
// shell): primary action, WORK / PATIENTS sections with distinct per-item
// icons, the pinned identity block resolved from /auth/me (never hardcoded),
// and the always-visible ACCOUNT group (Preferences · Language · Help · Sign
// out). Help/sign-out act (toast-confirmed against the mock boundary).

export function AppShell({
  children,
  banner,
}: {
  children: ReactNode;
  banner?: ReactNode;
}) {
  const t = useTranslations("shell");
  const locale = useLocale() as Locale;
  const pathname = usePathname();
  const base = `/${locale}`;
  const { me, clinicName, mergedWorkspace } = useSession();
  const { showToast } = useToast();

  const sections: ShellNavSection[] = [
    {
      heading: t("section-work"),
      items: [
        {
          href: `${base}/forms/new`,
          label: t("nav-new-form"),
          icon: <FilePlusIcon size={18} />,
        },
        {
          href: base,
          label: t("nav-in-progress"),
          icon: <ClockIcon size={18} />,
          exact: true,
        },
        {
          href: `${base}/history`,
          label: t("nav-completed"),
          icon: <CheckCircleIcon size={18} />,
        },
      ],
    },
    {
      heading: t("section-patients"),
      items: [
        {
          href: `${base}/patients`,
          label: t("nav-patients"),
          icon: <UsersIcon size={18} />,
        },
      ],
    },
  ];

  const rawName = me?.display_name ?? "";
  const displayName = rawName ? localeName(rawName, locale) : "";
  // A merged workspace spans every linked clinic — one combined label, never a
  // single clinic name (ADR 0041 §6).
  const clinicLabel = mergedWorkspace
    ? t("all-clinics")
    : clinicName
      ? localeName(clinicName, locale)
      : "";

  function handleHelp() {
    showToast(t("help-toast"));
  }

  function switchLocale(next: string) {
    if (next === locale) return;
    const prefix = `/${locale}`;
    const rest = pathname.startsWith(prefix) ? pathname.slice(prefix.length) : pathname;
    window.location.assign(`/${next}${rest === "" ? "/" : rest}`);
  }

  // The one account & preferences surface (shared ShellAccountMenu): a single
  // account bar opening the floating menu — Preferences, Help, the segmented
  // language selector, Sign out. Full bar at desktop; avatar-only on the rail.
  const accountMenuProps = {
    name: displayName || t("section-account"),
    sub: clinicLabel || undefined,
    avatar: rawName ? <Avatar name={rawName} size={32} /> : undefined,
    menuLabel: t("account-menu"),
    entries: [
      {
        key: "preferences",
        label: t("nav-preferences"),
        icon: <SettingsIcon size={16} />,
        href: `${base}/settings`,
      },
      {
        key: "help",
        label: t("nav-help"),
        icon: <HelpIcon size={16} />,
        onSelect: handleHelp,
      },
    ],
    language: {
      groupLabel: t("nav-language"),
      current: locale as string,
      options: [
        { code: "en-HK", label: "EN" },
        { code: "zh-Hant-HK", label: "中文" },
      ],
      onSelect: switchLocale,
    },
    signOut: {
      key: "sign-out",
      label: t("nav-sign-out"),
      icon: <SignOutIcon size={16} />,
      onSelect: () => void signOut({ locale, signInPath: "/sign-in" }),
    },
  };

  const footer = (
    <>
      <div className="hidden lg:block">
        <ShellAccountMenu {...accountMenuProps} />
      </div>
      <div className="lg:hidden">
        <ShellAccountMenu {...accountMenuProps} compact />
      </div>
    </>
  );

  return (
    <AcuityShell
      variant="app"
      primaryAction={{
        href: `${base}/forms/new`,
        label: t("start-form"),
        icon: <PlusIcon size={20} />,
      }}
      sections={sections}
      footer={footer}
      banner={banner}
      tabBar={[
        { href: base, label: t("nav-in-progress"), icon: <ClockIcon size={20} />, exact: true },
        { href: `${base}/history`, label: t("nav-completed"), icon: <CheckCircleIcon size={20} /> },
        { href: `${base}/patients`, label: t("nav-patients"), icon: <UsersIcon size={20} /> },
        { href: `${base}/settings`, label: t("nav-preferences"), icon: <SettingsIcon size={20} /> },
      ]}
      tabBarPrimary={{
        href: `${base}/forms/new`,
        label: t("start-form"),
        icon: <PlusIcon size={20} />,
      }}
      skipLabel={t("skip-to-content")}
      navLabel={t("open-navigation")}
    >
      {children}
    </AcuityShell>
  );
}

// The mobile account row: brand + the always-visible Language · Help · Sign out
// set (unreachable from the bottom tab bar, so it lives in this floating top
// capsule — the same floating-bar grammar as the marketing header and the
// bottom tab bar).
export function MobileTopBar() {
  const t = useTranslations("shell");
  const locale = useLocale() as Locale;
  const { showToast } = useToast();

  return (
    // A banner landmark so the row sits inside the landmark outline (axe
    // region) — it is the mobile counterpart of the shell header.
    <header className="sticky top-0 z-40 px-3 pt-3 md:hidden">
      <div className="flex items-center justify-between rounded-lg bg-card px-4 py-2 shadow-[var(--elevation-raised)]">
        <span className="font-title text-lg font-semibold text-primary">Acuity</span>
      <div className="flex items-center gap-1">
        <LanguageToggle variant="compact" />
        <button
          type="button"
          onClick={() => showToast(t("help-toast"))}
          aria-label={t("nav-help")}
          title={t("nav-help")}
          className="flex size-11 items-center justify-center rounded-md text-muted-foreground transition-colors duration-[120ms] hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <HelpIcon size={18} />
        </button>
        <SignOutButton
          locale={locale}
          signInPath="/sign-in"
          variant="ghost"
          aria-label={t("nav-sign-out")}
          title={t("nav-sign-out")}
          className="flex size-11 items-center justify-center rounded-md text-muted-foreground transition-colors duration-[120ms] hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <SignOutIcon size={18} />
        </SignOutButton>
        </div>
      </div>
    </header>
  );
}
