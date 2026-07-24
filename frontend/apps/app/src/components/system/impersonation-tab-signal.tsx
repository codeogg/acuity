"use client";

// Tab title prefix + favicon tint while impersonating (mirrors admin console).

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import type { ImpersonationUiMode } from "./impersonation-bar";

function modeHue(mode: ImpersonationUiMode): string {
  const name = mode === "proxy" ? "--caliber-mist-lavender" : "--caliber-sky-blue";
  const navy = getComputedStyle(document.documentElement).getPropertyValue("--caliber-navy").trim();
  const tint = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return tint && navy ? `${tint}|${navy}` : "";
}

function faviconFor(mode: ImpersonationUiMode): string | null {
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
  mode: ImpersonationUiMode;
}) {
  const t = useTranslations("system");
  const prefix = `[${t(mode === "proxy" ? "impersonation-tab-proxy" : "impersonation-tab-view", { doctor })}] `;

  useEffect(() => {
    const apply = () => {
      if (!document.title.startsWith(prefix)) {
        document.title = prefix + document.title.replace(/^\[[^\]]*\] /, "");
      }
    };
    apply();
    const titleElement = document.querySelector("title");
    const observer = titleElement ? new MutationObserver(apply) : null;
    if (titleElement && observer) observer.observe(titleElement, { childList: true });

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
