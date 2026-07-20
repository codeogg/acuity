"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { KeyRound, LogOut } from "lucide-react";

import { LocaleSwitcher } from "@/components/shared/LocaleSwitcher";
import { apiFetch } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { cn } from "@/lib/utils";

export interface NavItem {
  href: string;
  label: string;
}

function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return words[0]?.slice(0, 2).toUpperCase() ?? "?";
  return `${words[0]?.[0] ?? ""}${words[1]?.[0] ?? ""}`.toUpperCase() || "?";
}

export function AppShell({
  title,
  nav,
  displayName,
  children,
}: {
  title: string;
  nav: NavItem[];
  displayName?: string | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useI18n();

  async function logout() {
    await apiFetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-[var(--color-border)] bg-white">
        <div className="px-5 py-5 text-base font-semibold">{t(title)}</div>
        <nav className="flex-1 space-y-1 px-3">
          {nav.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "block rounded-lg px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                    : "text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]",
                )}
              >
                {t(item.label)}
              </Link>
            );
          })}
        </nav>
        <div className="flex flex-col gap-1 border-t border-[var(--color-border)] px-4 py-4">
          <div className="mb-2 flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)] text-sm font-semibold text-white">
              {getInitials(displayName)}
            </div>
            <span className="min-w-0 truncate text-sm font-semibold">
              {displayName ?? t("common.notLoggedIn")}
            </span>
          </div>

          <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--color-muted-foreground)]">
            {t("common.account")}
          </div>

          <Link
            href="/admin/profile"
            className="flex items-center gap-3 rounded-md px-2 py-1.5 text-sm text-[var(--color-foreground)] hover:bg-[var(--color-muted)]"
          >
            <KeyRound className="h-4 w-4 shrink-0 text-[var(--color-muted-foreground)]" />
            {t("common.changePassword")}
          </Link>

          <LocaleSwitcher compact />

          <button
            type="button"
            className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-sm text-[var(--color-foreground)] hover:bg-[var(--color-muted)]"
            onClick={logout}
          >
            <LogOut className="h-4 w-4 shrink-0 text-[var(--color-muted-foreground)]" />
            {t("common.logout")}
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto bg-[var(--color-muted)] p-8">{children}</main>
    </div>
  );
}
