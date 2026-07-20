"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { apiFetch } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { cn } from "@/lib/utils";
import {
  ClipboardList,
  Home,
  KeyRound,
  LayoutGrid,
  LogOut,
  PlusCircle,
} from "lucide-react";
import { LocaleSwitcher } from "@/components/shared/LocaleSwitcher";

export interface DoctorNavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
}

const DESKTOP_NAV: DoctorNavItem[] = [
  { href: "/doctor", label: "doctor.nav.dashboard", icon: Home, exact: true },
  { href: "/doctor/new-claim", label: "doctor.nav.newClaim", icon: PlusCircle },
  { href: "/doctor/claims", label: "doctor.nav.history", icon: ClipboardList },
  { href: "/doctor/presets", label: "doctor.nav.presets", icon: LayoutGrid },
];

const MOBILE_NAV: DoctorNavItem[] = [
  { href: "/doctor", label: "doctor.nav.dashboard", icon: Home, exact: true },
  { href: "/doctor/new-claim", label: "doctor.nav.newShort", icon: PlusCircle },
  { href: "/doctor/claims", label: "doctor.nav.records", icon: ClipboardList },
];

function isNavActive(pathname: string, item: DoctorNavItem): boolean {
  if (item.exact) {
    return pathname === item.href || pathname === `${item.href}/`;
  }
  return pathname.startsWith(item.href);
}

function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return words[0]?.slice(0, 2).toUpperCase() ?? "?";
  return `${words[0]?.[0] ?? ""}${words[1]?.[0] ?? ""}`.toUpperCase() || "?";
}

function UserMenu({
  displayName,
  onLogout,
}: {
  displayName?: string | null;
  onLogout: () => void;
}) {
  const initials = getInitials(displayName);
  const { t } = useI18n();

  return (
    <div className="border-t border-[var(--color-border)] px-4 py-4 flex flex-col gap-1">
      {/* 头像 + 姓名 */}
      <div className="flex items-center gap-3 mb-2">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)] text-sm font-semibold text-white">
          {initials}
        </div>
        <span className="min-w-0 truncate text-sm font-semibold">
          {displayName ?? t("common.notLoggedIn")}
        </span>
      </div>

      {/* 分组标题 */}
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--color-muted-foreground)]">
        {t("common.account")}
      </div>

      {/* 修改密码 */}
      <Link
        href="/doctor/profile"
        className="flex items-center gap-3 rounded-md px-2 py-1.5 text-sm text-[var(--color-foreground)] hover:bg-[var(--color-muted)]"
      >
        <KeyRound className="h-4 w-4 shrink-0 text-[var(--color-muted-foreground)]" />
        {t("common.changePassword")}
      </Link>

      <LocaleSwitcher compact />

      {/* 退出登录 */}
      <button
        type="button"
        onClick={onLogout}
        className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-sm text-[var(--color-foreground)] hover:bg-[var(--color-muted)]"
      >
        <LogOut className="h-4 w-4 shrink-0 text-[var(--color-muted-foreground)]" />
        {t("common.logout")}
      </button>
    </div>
  );
}

export function DoctorAppShell({
  displayName,
  children,
}: {
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
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* 桌面侧边栏：sticky 固定在视口左侧，h-screen 确保始终占满全屏高度 */}
      <aside className="hidden w-56 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)] md:flex md:h-screen md:sticky md:top-0">
        <div className="px-5 py-5 text-sm font-semibold tracking-tight">
          {t("doctor.shell.title")}
        </div>
        <nav className="flex-1 overflow-y-auto space-y-0.5 px-3">
          {DESKTOP_NAV.map((item) => {
            const active = isNavActive(pathname, item);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-[var(--color-accent-soft)] font-medium text-[var(--color-primary)]"
                    : "text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {t(item.label)}
              </Link>
            );
          })}
        </nav>

        {/* 底部用户菜单，永远贴在侧边栏底部 */}
        <UserMenu displayName={displayName ?? null} onLogout={logout} />
      </aside>

      <div className="flex min-h-screen flex-1 flex-col">
        <main className="flex-1 overflow-auto bg-[var(--color-muted)] p-4 pb-20 md:p-8 md:pb-8">
          {children}
        </main>

        {/* 移动端底部导航 */}
        <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-[var(--color-border)] bg-[var(--color-surface)] md:hidden">
          {MOBILE_NAV.map((item) => {
            const active = isNavActive(pathname, item);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px]",
                  active
                    ? "font-medium text-[var(--color-primary)]"
                    : "text-[var(--color-muted-foreground)]",
                )}
              >
                <Icon className="h-5 w-5" />
                {t(item.label)}
              </Link>
            );
          })}
          {/* 移动端「我的」入口 */}
          <Link
            href="/doctor/profile"
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px]",
              pathname.startsWith("/doctor/profile")
                ? "font-medium text-[var(--color-primary)]"
                : "text-[var(--color-muted-foreground)]",
            )}
          >
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-primary)] text-[8px] font-bold text-white">
              {getInitials(displayName)}
            </div>
            {t("doctor.nav.me")}
          </Link>
        </nav>
      </div>
    </div>
  );
}
