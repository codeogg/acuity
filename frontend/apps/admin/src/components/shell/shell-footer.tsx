"use client";

// Bottom account & preferences surface: the single account bar that opens the
// shared floating menu (Preferences, language selection, Sign out) — the
// ShellAccountMenu grammar shared with the doctor app. Sign-out rides the
// shared auth-ui POST-based sign-out (never a GET link).

import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@acuity/i18n/navigation";
import { ShellAccountMenu } from "@acuity/ui";
import { AcuityIcon } from "@acuity/ui";
import { Avatar } from "@acuity/ui";
import { consoleSignOut } from "@/components/shell/console-sign-out";

export function ShellFooter({
  locale,
  operatorName,
  operatorRole,
  compact,
}: {
  locale: string;
  operatorName: string;
  operatorRole: string;
  /** Icon-rail / mobile-top-bar mode: avatar-only trigger. */
  compact?: boolean;
}) {
  const t = useTranslations("nav");
  const currentLocale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const settingsHref = `/${locale}/settings`;

  function switchTo(next: string) {
    if (next === currentLocale) return;
    router.push(pathname, { locale: next });
  }

  return (
    <ShellAccountMenu
      compact={compact}
      name={operatorName}
      sub={operatorRole}
      avatar={<Avatar name={operatorName} size={32} />}
      menuLabel={t("account-menu")}
      entries={[
        {
          key: "settings",
          label: t("item.settings"),
          icon: <AcuityIcon name="settings" size={16} />,
          href: settingsHref,
        },
      ]}
      language={{
        groupLabel: t("language"),
        current: currentLocale,
        options: [
          { code: "en-HK", label: "EN" },
          { code: "zh-Hant-HK", label: "中文" },
        ],
        onSelect: switchTo,
      }}
      signOut={{
        key: "sign-out",
        label: t("item.sign-out"),
        icon: <AcuityIcon name="sign-out" size={16} />,
        onSelect: () => consoleSignOut(locale),
      }}
    />
  );
}
