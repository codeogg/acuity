"use client";

import { useEffect, useState } from "react";
import { frontendOnly } from "@acuity/api-client";
import type { Locale } from "@/i18n/routing";

// Insurer + form display names resolved from API responses (the coverage
// registry carries both locales' names per company/template), replacing the
// direct fixture lookups the surfaces previously imported. Cached at module
// scope: one fetch serves every consumer for the session.

export type CoverageInsurer = Awaited<
  ReturnType<typeof frontendOnly.coverageRegistry.getCoverageRegistry>
>[number];

export interface Catalog {
  insurers: CoverageInsurer[];
  companyName: (companyId: number, locale: Locale) => string;
  formName: (templateId: number, locale: Locale) => string;
  formPageCount: (templateId: number) => number | null;
}

function buildCatalog(insurers: CoverageInsurer[]): Catalog {
  const companies = new Map<number, CoverageInsurer>();
  const forms = new Map<number, { en: string; zh: string; pages: number }>();
  for (const insurer of insurers) {
    companies.set(insurer.company_id, insurer);
    for (const form of insurer.forms) {
      forms.set(form.template_id, {
        en: form.form_name_en,
        zh: form.form_name_zh,
        pages: form.page_count,
      });
    }
  }
  return {
    insurers,
    companyName: (companyId, locale) => {
      const insurer = companies.get(companyId);
      if (!insurer) return "";
      return locale === "zh-Hant-HK" ? insurer.company_name_zh : insurer.company_name_en;
    },
    formName: (templateId, locale) => {
      const form = forms.get(templateId);
      if (!form) return "";
      return locale === "zh-Hant-HK" ? form.zh : form.en;
    },
    formPageCount: (templateId) => forms.get(templateId)?.pages ?? null,
  };
}

const EMPTY = buildCatalog([]);

let cached: Catalog | null = null;
let pending: Promise<Catalog> | null = null;

export function loadCatalog(): Promise<Catalog> {
  if (cached) return Promise.resolve(cached);
  pending ??= frontendOnly.coverageRegistry
    .getCoverageRegistry()
    .then((insurers) => {
      cached = buildCatalog(insurers);
      return cached;
    })
    .catch(() => {
      pending = null;
      return EMPTY;
    });
  return pending;
}

/** The cached catalog (empty until loaded); triggers the fetch on first use. */
export function useCatalog(): Catalog {
  const [catalog, setCatalog] = useState<Catalog>(cached ?? EMPTY);
  useEffect(() => {
    let cancelled = false;
    void loadCatalog().then((c) => {
      if (!cancelled) setCatalog(c);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return catalog;
}
