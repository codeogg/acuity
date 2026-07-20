"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  cn,
} from "@component-core/ui";
import { ChevronDownIcon, GlobeIcon } from "../icons";

// The one account & preferences surface at the bottom of every shell sidebar:
// a single account bar (avatar + name + sub + a small chevron; hover
// highlights the bar) that opens a compact floating menu — Preferences, Help,
// the segmented language selector (the doctor-app EN/中文 grammar), and Sign
// out. Replaces the always-visible row stacks; one grammar for app + console.

export interface AccountMenuEntry {
  key: string;
  label: string;
  icon?: ReactNode;
  /** Destination entries render as links; action entries call onSelect. */
  href?: string;
  onSelect?: () => void;
}

export interface AccountMenuLanguage {
  groupLabel: string;
  current: string;
  options: { code: string; label: string }[];
  onSelect: (code: string) => void;
}

export function ShellAccountMenu({
  name,
  sub,
  avatar,
  entries,
  signOut,
  language,
  menuLabel,
  compact,
}: {
  name: string;
  sub?: string;
  /** Avatar node (the app-side DefaultAvatar / console Avatar). */
  avatar?: ReactNode;
  /** Destination/action entries (Preferences, Help, ...), in order. */
  entries: AccountMenuEntry[];
  signOut: AccountMenuEntry;
  language?: AccountMenuLanguage;
  /** aria-label for the account bar trigger. */
  menuLabel: string;
  /** Icon-rail mode (tablet): avatar-only trigger. */
  compact?: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={menuLabel}
        className={cn(
          "group flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors duration-[120ms] hover:bg-accent",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
          "aria-expanded:bg-accent",
          compact && "justify-center px-0",
        )}
      >
        {avatar}
        {!compact && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-foreground">
                {name}
              </span>
              {sub ? (
                <span className="block truncate text-xs text-muted-foreground">
                  {sub}
                </span>
              ) : null}
            </span>
            <ChevronDownIcon
              size={16}
              className="shrink-0 text-muted-foreground transition-transform duration-150 group-aria-expanded:rotate-180"
            />
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-60">
        {entries.map((entry) =>
          entry.href ? (
            <DropdownMenuItem key={entry.key} asChild>
              <Link href={entry.href} className="flex items-center gap-2.5">
                {entry.icon ? (
                  <span className="flex text-muted-foreground">{entry.icon}</span>
                ) : null}
                <span>{entry.label}</span>
              </Link>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              key={entry.key}
              onSelect={() => entry.onSelect?.()}
              className="flex items-center gap-2.5"
            >
              {entry.icon ? (
                <span className="flex text-muted-foreground">{entry.icon}</span>
              ) : null}
              <span>{entry.label}</span>
            </DropdownMenuItem>
          ),
        )}

        {language ? (
          <>
            <DropdownMenuSeparator />
            {/* Segmented language selector (the doctor-app grammar) — plain
                buttons, not menu items, so a mis-tap never closes the menu
                before the route swap lands. */}
            <div
              role="group"
              aria-label={language.groupLabel}
              className="flex items-center gap-1 px-2 py-1.5"
            >
              <span className="flex text-muted-foreground">
                <GlobeIcon size={16} />
              </span>
              {language.options.map((o) => {
                const active = o.code === language.current;
                return (
                  <button
                    key={o.code}
                    type="button"
                    onClick={() => language.onSelect(o.code)}
                    aria-pressed={active}
                    className={cn(
                      "h-7 rounded-md px-2.5 text-xs font-medium transition-colors duration-100",
                      active
                        ? "bg-sky-blue/50 text-navy hover:bg-sky-blue/65"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          </>
        ) : null}

        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => signOut.onSelect?.()}
          className="flex items-center gap-2.5"
        >
          {signOut.icon ? (
            <span className="flex text-muted-foreground">{signOut.icon}</span>
          ) : null}
          <span>{signOut.label}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
