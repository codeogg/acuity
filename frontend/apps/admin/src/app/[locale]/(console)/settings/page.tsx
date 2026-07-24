// Preferences — operator self-service: editable profile, the internal RBAC
// panel (super-admin only), locale display, and sign out. Reached from the
// sidebar identity block.

import { getTranslations, setRequestLocale } from "next-intl/server";
import { StatusBadge } from "@/components/ui/ui-client";
import { SectionTopBar } from "@/components/shell/section-top-bar";
import { Avatar } from "@acuity/ui";
import { AcuityIcon } from "@acuity/ui";
import { KeyVal } from "@/components/ui/detail";
import { ProfileFields, ChangePasswordForm, RbacPanel, SettingsSignOut } from "./settings-view";
import { getCurrentUser, operatorRoleLabel } from "@/lib/data";
import { listOperators } from "@/lib/ops-model";

export default async function SettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("settings");
  const me = await getCurrentUser();
  const displayName = me.display_name?.trim() || me.username || `user-${me.user_id}`;
  const roleLabel = operatorRoleLabel(me.role);
  const operators = listOperators();

  return (
    <div className="flex h-full flex-col">
      <SectionTopBar eyebrow={t("eyebrow")} title={t("title")} />
      <div className="slim-scroll min-h-0 flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-3xl space-y-6">
          <section className="rounded-lg border border-border bg-card p-6">
            <h2 className="mb-4 font-mono text-xs font-medium uppercase tracking-eyebrow text-muted-foreground">
              {t("profile")}
            </h2>
            <div className="mb-4 flex items-center gap-4">
              <Avatar name={displayName} size={48} />
              <div>
                <div className="text-sm font-medium text-foreground">{displayName}</div>
                <div className="flex items-center gap-1 font-mono text-xs text-muted-foreground">
                  <AcuityIcon name="shield" size={12} />
                  {roleLabel}
                </div>
              </div>
            </div>
            <ProfileFields name={displayName} username={me.username ?? "—"} />
            <KeyVal label={t("locale")}>{locale === "zh-Hant-HK" ? "繁體中文（香港）" : "English (Hong Kong)"}</KeyVal>
          </section>

          <section className="rounded-lg border border-border bg-card p-6">
            <h2 className="mb-4 font-mono text-xs font-medium uppercase tracking-eyebrow text-muted-foreground">
              {t("password")}
            </h2>
            <ChangePasswordForm />
          </section>

          {roleLabel === "super-admin" ? (
            <section className="rounded-lg border border-border bg-card p-6">
              <div className="mb-4 flex items-center gap-2">
                <h2 className="font-mono text-xs font-medium uppercase tracking-eyebrow text-muted-foreground">
                  {t("rbac")}
                </h2>
                <StatusBadge tone="accent" appearance="outline" label={t("super-admin-only")} icon={<AcuityIcon name="shield" size={13} />} />
              </div>
              <RbacPanel operators={operators} />
            </section>
          ) : null}

          <SettingsSignOut locale={locale} label={t("sign-out")} />
        </div>
      </div>
    </div>
  );
}
