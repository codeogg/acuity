"use client";

import { cn } from "@/lib/cn";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, GlobeIcon, MenuIcon, XIcon, WhatsAppIcon } from "@acuity/ui";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { marketingButtonSizeClass } from "@/components/marketing";

// Public-site navbar: a frosted-glass capsule floating over the boxed hero
// band (translucent cream + backdrop blur + hairline border), which compacts
// on scroll into a smaller solid-card capsule — every element (wordmark, nav,
// locale toggle, CTA) stays present in the compact state. The active nav
// indicator is a pill wash behind the item (background/colour only — every
// item keeps an identical box, per the caliber motion rule); the height/width
// morph is scroll-state, not interaction.

const NAV = [
  { href: "/", key: "home" },
  { href: "/how-it-works", key: "how-it-works" },
  { href: "/insurers", key: "insurers" },
  { href: "/customers", key: "customers" },
  { href: "/security", key: "security" },
  { href: "/about", key: "about" },
] as const;

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteHeader({ locale }: { locale: string }) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const nextLocale = locale.startsWith("zh") ? "en-HK" : "zh-Hant-HK";
  const toggleLabel = locale.startsWith("zh") ? "English" : "繁體中文";

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function switchLocale() {
    router.replace(pathname, { locale: nextLocale });
  }

  return (
    <header
      className={cn(
        // Rhythm contract: at rest the capsule sits one frame-gap INSIDE the
        // box (page→box gap == box→capsule gap, i.e. top offset = 2× frame);
        // scrolled, the offset collapses to exactly the frame gap. On small
        // viewports the capsule keeps its own side gutter from the box edge.
        "fixed inset-x-0 top-0 z-50 px-6 transition-[padding] duration-300 ease-out motion-reduce:transition-none md:px-frame",
        scrolled ? "pt-frame" : "pt-6 md:pt-10",
      )}
    >
      <div
        className={cn(
          // Inner padding is constant across shrink states.
          "mx-auto flex items-center gap-4 rounded-box border px-4 backdrop-blur-md transition-[height,max-width,background-color,border-color,box-shadow] duration-300 ease-out motion-reduce:transition-none md:px-6",
          scrolled
            ? "h-12 max-w-content border-border bg-card shadow-md"
            : "h-16 max-w-shell border-on-navy/25 bg-on-navy/10",
        )}
      >
        <Link
          href="/"
          className={cn(
            "font-title leading-none tracking-title transition-[font-size,color] duration-300 motion-reduce:transition-none",
            scrolled ? "text-xl text-navy" : "text-2xl text-on-navy",
          )}
          aria-label={t("home-aria")}
        >
          Acuity
        </Link>

        <nav aria-label={t("primary-aria")} className="hidden flex-1 lg:block">
          <ul className="flex items-center justify-center gap-1">
            {NAV.map((n) => {
              const active = isActive(pathname, n.href);
              return (
                <li key={n.href}>
                  <Link
                    href={n.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "inline-flex rounded-full px-3 py-1.5 font-mono text-xs font-medium uppercase tracking-chip transition-colors",
                      // Active chips are fully OPAQUE in both states so the
                      // content scrolling behind the capsule never bleeds
                      // through the indicator.
                      scrolled
                        ? active
                          ? "bg-navy text-on-navy"
                          : "text-ink-muted hover:bg-accent hover:text-navy"
                        : active
                          ? "bg-cream text-navy"
                          : "text-on-navy/70 hover:bg-on-navy/8 hover:text-on-navy",
                    )}
                  >
                    {t(n.key)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <span className="flex-1 lg:hidden" />

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={switchLocale}
            className={cn(
              "inline-flex min-h-11 items-center gap-1 p-2 text-sm transition-colors",
              scrolled
                ? "text-ink-muted hover:text-navy"
                : "text-on-navy/80 hover:text-on-navy",
            )}
          >
            <GlobeIcon className="size-4" />
            <span>{toggleLabel}</span>
          </button>

          <Button
            asChild
            className={cn(
              marketingButtonSizeClass("md"),
              "hidden bg-sky-blue text-navy hover:bg-cream lg:inline-flex",
              scrolled && "h-9",
            )}
          >
            <Link href="/contact">
              <WhatsAppIcon className="size-4" />
              <span className="btn-label">{t("cta")}</span>
            </Link>
          </Button>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className={cn(
              "inline-flex min-h-11 items-center gap-2 p-2 text-sm font-medium lg:hidden",
              scrolled ? "text-ink" : "text-on-navy",
            )}
          >
            {open ? <XIcon className="size-5" /> : <MenuIcon className="size-5" />}
            <span>{t("menu")}</span>
          </button>
        </div>
      </div>

      {open ? (
        <nav
          aria-label={t("primary-aria")}
          className="mx-auto mt-2 max-w-shell rounded-card border border-border bg-card px-3 py-3 shadow-md lg:hidden"
        >
          {NAV.map((n) => {
            const active = isActive(pathname, n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                onClick={() => setOpen(false)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "block rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-sky-blue/50 text-navy"
                    : "text-ink hover:bg-accent",
                )}
              >
                {t(n.key)}
              </Link>
            );
          })}
          <Button
            asChild
            className={cn(marketingButtonSizeClass("md"), "mt-3 w-full")}
          >
            <Link href="/contact" onClick={() => setOpen(false)}>
              <WhatsAppIcon className="size-4" />
              <span className="btn-label">{t("cta")}</span>
            </Link>
          </Button>
        </nav>
      ) : null}
    </header>
  );
}
