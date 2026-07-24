"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, type ReactNode } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  cn,
} from "@component-core/ui";
import { DotsIcon } from "../icons";

// The one Acuity authenticated-surface shell (overview.md Finalised shell),
// promoted from the doctor-app implementation so app and console share a
// single shell instead of per-app forks. The marketing site keeps its own
// header (a different, non-shell grammar).
//
// Grammar (both variants): a boxed canvas — the sidebar is a floating RAISED
// card on the cream page ground (rounded, hairline border, raised elevation),
// matching the marketing surfaces' boxed-canvas language; the console work
// area is a second card with its own scroll. Static section headings; items
// always visible (no dropdown / accordion); active row = wash + colour,
// never a weight bump (no geometry change on interaction).
//
// Both variants share one responsive grammar: full sidebar (≥lg), icon rail
// (md–lg, labels collapse accessibly), bottom tab bar (<md).
//
// Variants:
//   - "app" (doctor app): page scroll on the cream ground; optional primary
//     action above the nav; the tab set covers the whole nav.
//   - "console" (operator console): fixed-height work-area card with its own
//     scroll, brand wordmark, and — because the console nav is deeper than a
//     tab bar holds — a trailing "more" tab opening the overflow menu (every
//     section item not already a tab, grouped under its section heading).
//
// i18n, identity, language toggles and sign-out live app-side and arrive as
// strings/slots - the shell is presentation only.

export interface ShellNavItem {
  href: string;
  /** Localised item label (a string in the common case; any node works). */
  label: ReactNode;
  icon?: ReactNode;
  /** Trailing count chip (e.g. the console's per-destination totals). */
  count?: number;
  /** Match this item only on an exact path (e.g. the locale-root "home"). */
  exact?: boolean;
}

function NavCount({ count }: { count: number }) {
  return (
    <span className="rounded-full bg-glaucous/15 px-1.5 py-0.5 text-xs tabular-nums text-venice">
      {count}
    </span>
  );
}

export interface ShellNavSection {
  /** Mono uppercase section heading; omit for an unlabelled group. */
  heading?: string;
  items: ShellNavItem[];
}

function isActive(pathname: string, item: ShellNavItem): boolean {
  if (item.exact) return pathname === item.href || pathname === `${item.href}/`;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <p className="px-3 py-1 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
      {children}
    </p>
  );
}

export function ShellNavRow({
  item,
  active,
}: {
  item: ShellNavItem;
  active: boolean;
}) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors duration-[120ms]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        // Icon-rail widths (below lg the sidebar is a 64px rail): centre the
        // glyph; the label collapses via the sr-only span below.
        "max-lg:justify-center max-lg:px-0",
        // The one nav active-state grammar: a perceptibly BLUE coloured box
        // (sky wash + navy text) — no accent line, no weight bump (geometry
        // rule). Hover on inactive = accent wash; hover on active deepens the
        // wash slightly so the active item still acknowledges the pointer.
        active
          ? "bg-sky-blue/50 text-navy hover:bg-sky-blue/65"
          : "text-foreground hover:bg-accent",
      )}
    >
      {item.icon ? (
        <span className={cn(active ? "text-navy" : "text-muted-foreground")}>
          {item.icon}
        </span>
      ) : null}
      {/* At rail widths the label (and its count chip) leaves the visual
          layout but stays in the accessibility tree (visually-hidden, never
          display:none). */}
      <span className="flex min-w-0 flex-1 items-center justify-between gap-2 max-lg:sr-only">
        <span className="truncate">{item.label}</span>
        {item.count != null ? <NavCount count={item.count} /> : null}
      </span>
    </Link>
  );
}

// ---- bottom tab bar (<md) ---------------------------------------------------

const TAB_CLASS =
  "flex min-w-[48px] flex-1 flex-col items-center justify-center gap-0.5 rounded-md py-2 text-[10px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function ShellTabMore({
  more,
  groups,
  pathname,
}: {
  more: ShellTabBarMore;
  groups: ShellNavSection[];
  pathname: string;
}) {
  // The more tab reflects an active overflow destination so the current
  // location never disappears from the tab bar.
  const anyActive = groups.some((g) => g.items.some((i) => isActive(pathname, i)));
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          TAB_CLASS,
          anyActive
            ? "bg-sky-blue/50 text-navy aria-expanded:bg-sky-blue/65"
            : "text-muted-foreground hover:bg-accent aria-expanded:bg-accent",
        )}
      >
        {more.icon ?? <DotsIcon size={20} />}
        <span className="truncate px-1">{more.label}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="top"
        align="end"
        className="max-h-[70dvh] w-64 overflow-y-auto"
      >
        {groups.map((group, gi) => (
          <Fragment key={group.heading ?? gi}>
            {gi > 0 ? <DropdownMenuSeparator /> : null}
            {group.heading ? <SectionHeading>{group.heading}</SectionHeading> : null}
            {group.items.map((item) => {
              const active = isActive(pathname, item);
              return (
                <DropdownMenuItem key={item.href} asChild>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-2.5",
                      active && "bg-sky-blue/50 text-navy data-[highlighted]:bg-sky-blue/65",
                    )}
                  >
                    {item.icon ? (
                      <span className={cn("flex", active ? "text-navy" : "text-muted-foreground")}>
                        {item.icon}
                      </span>
                    ) : null}
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {item.count != null ? <NavCount count={item.count} /> : null}
                  </Link>
                </DropdownMenuItem>
              );
            })}
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ShellTabBar({
  items,
  primary,
  more,
  moreGroups,
  navLabel,
  pathname,
}: {
  items: ShellNavItem[];
  primary?: { href: string; label: string; icon?: ReactNode };
  more?: ShellTabBarMore;
  moreGroups: ShellNavSection[];
  navLabel: string;
  pathname: string;
}) {
  return (
    // A floating capsule matching the marketing header's grammar — inset from
    // the edges (respecting the device safe area), rounded, raised elevation —
    // with the same coloured-box active treatment as the sidebar. Items are
    // listed; only genuine overflow sits behind the "more" menu.
    <nav
      className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 flex items-stretch gap-1 rounded-lg border border-border bg-sidebar p-1.5 shadow-[var(--elevation-overlay)] md:hidden"
      aria-label={navLabel}
    >
      {primary ? (
        <Link
          href={primary.href}
          aria-current={isActive(pathname, primary) ? "page" : undefined}
          className={cn(TAB_CLASS, "bg-primary font-medium text-primary-foreground")}
        >
          {primary.icon}
          <span className="truncate px-1">{primary.label}</span>
        </Link>
      ) : null}
      {items.map((item) => {
        const active = isActive(pathname, item);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              TAB_CLASS,
              active
                ? "bg-sky-blue/50 text-navy"
                : "text-muted-foreground hover:bg-accent",
            )}
          >
            {item.icon}
            <span className="truncate px-1">{item.label}</span>
          </Link>
        );
      })}
      {more && moreGroups.length > 0 ? (
        <ShellTabMore more={more} groups={moreGroups} pathname={pathname} />
      ) : null}
    </nav>
  );
}

export interface ShellTabBarMore {
  /** Localised "more" tab label. */
  label: string;
  icon?: ReactNode;
}

export interface AcuityShellProps {
  variant?: "app" | "console";
  /** Sidebar brand block (e.g. the "Acuity" wordmark; console variant). */
  brand?: ReactNode;
  /** Primary action above the nav (app variant CTA). */
  primaryAction?: { href: string; label: string; icon?: ReactNode };
  sections: ShellNavSection[];
  /** Identity block above the account group (avatar + name + clinic/role). */
  identity?: ReactNode;
  /** Footer controls (language toggle, help, sign-out) - app-side slots. */
  footer?: ReactNode;
  /** Rendered above the whole shell (e.g. the impersonation banner). */
  banner?: ReactNode;
  /** Mobile top bar (<md), rendered between the banner and the work area —
      the app-side floating capsule carrying brand + account controls. */
  topBar?: ReactNode;
  /** Mobile bottom tab bar items (omit to skip the tab bar). */
  tabBar?: ShellNavItem[];
  /** Leading primary tab (app variant; the filled "start form" tab). */
  tabBarPrimary?: { href: string; label: string; icon?: ReactNode };
  /** Trailing "more" tab (console variant): opens a floating menu listing
      every section item not already in the tab set, grouped by section. */
  tabBarMore?: ShellTabBarMore;
  /** Skip-to-content label (localised app-side). */
  skipLabel: string;
  /** aria-label for the navigation landmarks (localised app-side). */
  navLabel: string;
  children: ReactNode;
}

export function AcuityShell({
  variant = "app",
  brand,
  primaryAction,
  sections,
  identity,
  footer,
  banner,
  topBar,
  tabBar,
  tabBarPrimary,
  tabBarMore,
  skipLabel,
  navLabel,
  children,
}: AcuityShellProps) {
  const pathname = usePathname();
  const console_ = variant === "console";
  // Banner sits above the shell; keep the app viewport locked (h-dvh) so the
  // banner does not push min-h-screen content past 100vh and spawn a page scrollbar.
  const lockViewport = console_ || Boolean(banner);

  // Overflow for the "more" tab: every section item that is not already a tab
  // (by href), with its section grouping preserved.
  const tabHrefs = new Set((tabBar ?? []).map((i) => i.href));
  const moreGroups = tabBarMore
    ? sections
        .map((s) => ({ ...s, items: s.items.filter((i) => !tabHrefs.has(i.href)) }))
        .filter((s) => s.items.length > 0)
    : [];

  return (
    <div
      className={cn(
        "bg-background text-foreground",
        lockViewport ? "flex h-dvh flex-col overflow-hidden" : "min-h-screen",
      )}
    >
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        {skipLabel}
      </a>
      {banner}
      {topBar}

      <div
        className={cn(
          "flex",
          lockViewport
            ? "min-h-0 flex-1"
            : "min-h-screen",
          console_ ? "gap-3 p-3" : "md:gap-3 md:p-3",
          // Clear the fixed bottom tab bar so the work-area card never sits
          // under it.
          console_ && tabBar && "max-md:pb-24",
        )}
      >
        <aside
          className={cn(
            // Borderless card: the raised shadow alone defines the sidebar
            // edge (the hairline read as a stray divider next to the content).
            // One responsive grammar for both variants: hidden below md, icon
            // rail md–lg, full card ≥lg.
            "shrink-0 flex-col rounded-lg bg-sidebar shadow-[var(--elevation-raised)]",
            console_
              ? "hidden py-6 md:flex md:w-16 md:px-1.5 lg:w-[15.5rem] lg:min-w-[15.5rem] lg:pl-4 lg:pr-1"
              : cn(
                  "sticky top-3 hidden md:flex md:w-16 lg:w-[15.5rem]",
                  lockViewport ? "h-full min-h-0" : "h-[calc(100vh-1.5rem)]",
                ),
          )}
          aria-label={navLabel}
        >
          {brand ? (
            <div className="hidden select-none px-2 pb-2 font-title text-2xl font-semibold text-primary lg:block">
              {brand}
            </div>
          ) : null}

          {primaryAction ? (
            <div className="p-3 lg:p-4">
              <Link
                href={primaryAction.href}
                className={cn(
                  "flex h-11 items-center justify-center gap-2 rounded-md bg-primary text-sm font-medium text-primary-foreground transition-colors duration-[120ms]",
                  "hover:bg-[var(--color-action-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  "lg:px-4",
                )}
                title={primaryAction.label}
              >
                {primaryAction.icon}
                <span className={cn(!console_ && "hidden lg:inline")}>
                  {primaryAction.label}
                </span>
              </Link>
            </div>
          ) : null}

          <nav
            className={cn(
              // The scroll container reaches the card edge so the scrollbar
              // hugs it; content keeps its gutter via the inner padding.
              "flex flex-1 flex-col gap-1 overflow-y-auto",
              console_ ? "lg:pr-3" : "pb-1 pl-2 pr-1",
            )}
            aria-label={navLabel}
          >
            {sections.map((section, i) => (
              <div key={section.heading ?? i} className={i === 0 ? "mt-2" : "mt-4"}>
                {section.heading ? (
                  <div className="hidden lg:block">
                    <SectionHeading>{section.heading}</SectionHeading>
                  </div>
                ) : null}
                {section.items.map((item) => (
                  <ShellNavRow
                    key={item.href}
                    item={item}
                    active={isActive(pathname, item)}
                  />
                ))}
              </div>
            ))}

            <div className="flex-1" />

            {(identity || footer) && (
              <div className="mb-2 mt-4 border-t border-border pt-3">
                {identity}
                {footer}
              </div>
            )}
          </nav>
        </aside>

        {/* Work area — a second card in the console (own scroll); the app
            variant keeps the page scroll on the cream ground, except when a
            banner locks the viewport (then main scrolls inside). */}
        <div
          className={cn(
            "flex min-w-0 flex-1 flex-col",
            console_
              ? "overflow-hidden rounded-lg border border-border bg-background shadow-[var(--elevation-raised)]"
              : "pb-24 md:pb-0",
            lockViewport && !console_ && "min-h-0 overflow-hidden",
          )}
        >
          <main
            id="main"
            className={cn("flex-1", lockViewport && "min-h-0 overflow-y-auto")}
          >
            {children}
          </main>
        </div>
      </div>

      {tabBar ? (
        <ShellTabBar
          items={tabBar}
          primary={tabBarPrimary}
          more={tabBarMore}
          moreGroups={moreGroups}
          navLabel={navLabel}
          pathname={pathname}
        />
      ) : null}
    </div>
  );
}
