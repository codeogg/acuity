"use client";

// Extra impersonation channels that survive tab-switching: while a session is
// active the browser tab title carries a "[Viewing as …]" prefix and the
// favicon swaps to a mode-tinted dot, so an operator with many tabs open
// never loses the in-page banner's signal. Redundant channels only — the
// persistent banner (text + icon + tint, non-dismissable) stays the primary
// signal and the favicon is never load-bearing on its own.

import { useEffect } from "react";
import { useTranslations } from "next-intl";

function modeHue(mode: "view-as" | "act-as"): string {
  // Resolve the Caliber tint at runtime so the favicon rides the token layer
  // (a data-URI cannot reference a CSS variable).
  const name = mode === "act-as" ? "--caliber-mist-lavender" : "--caliber-sky-blue";
  const navy = getComputedStyle(document.documentElement).getPropertyValue("--caliber-navy").trim();
  const tint = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return tint && navy ? `${tint}|${navy}` : "";
}

function faviconFor(mode: "view-as" | "act-as"): string | null {
  const hues = modeHue(mode);
  if (!hues) return null;
  const [tint, navy] = hues.split("|");
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">` +
    `<rect width="16" height="16" rx="3" fill="${tint}"/>` +
    `<circle cx="8" cy="8" r="3.5" fill="${navy}"/>` +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function ImpersonationTabSignal({
  doctor,
  mode,
}: {
  doctor: string;
  mode: "view-as" | "act-as";
}) {
  const t = useTranslations("impersonation");
  const prefix = `[${t(mode === "act-as" ? "tab-acting" : "tab-viewing", { doctor })}] `;

  useEffect(() => {
    // --- title prefix (re-applied if a navigation rewrites the title) -------
    const apply = () => {
      if (!document.title.startsWith(prefix)) {
        document.title = prefix + document.title.replace(/^\[[^\]]*\] /, "");
      }
    };
    apply();
    const titleElement = document.querySelector("title");
    const observer = titleElement ? new MutationObserver(apply) : null;
    if (titleElement && observer) observer.observe(titleElement, { childList: true });

    // --- favicon swap --------------------------------------------------------
    const href = faviconFor(mode);
    let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
    const previous = link?.href ?? null;
    let created = false;
    if (href) {
      if (!link) {
        link = document.createElement("link");
        link.rel = "icon";
        document.head.append(link);
        created = true;
      }
      link.href = href;
    }

    return () => {
      observer?.disconnect();
      document.title = document.title.replace(/^\[[^\]]*\] /, "");
      if (link && href) {
        if (created && !previous) link.remove();
        else if (previous) link.href = previous;
      }
    };
  }, [prefix, mode]);

  return null;
}
