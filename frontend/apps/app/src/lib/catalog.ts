"use client";

import { useEffect, useState } from "react";
import { claims } from "@acuity/api-client";
import type { Locale } from "@/i18n/routing";

// Insurer + form display names from the live doctor catalog endpoints
// (`/doctor/insurance-companies` + templates), not the mock coverage-registry.

export interface CatalogInsurer {
  company_id: number;
  company_name_en: string;
  company_name_zh: string;
  forms: Array<{
    template_id: number;
    form_name_en: string;
    form_name_zh: string;
    page_count: number;
  }>;
}

export interface Catalog {
  insurers: CatalogInsurer[];
  companyName: (companyId: number, locale: Locale) => string;
  formName: (templateId: number, locale: Locale) => string;
  formPageCount: (templateId: number) => number | null;
}

function buildCatalog(insurers: CatalogInsurer[]): Catalog {
  const companies = new Map<number, CatalogInsurer>();
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

async function fetchLiveCatalog(): Promise<CatalogInsurer[]> {
  const companies = await claims.listEnabledCompanies();
  return Promise.all(
    companies.map(async (company) => {
      const templates = await claims.listCompanyTemplates(company.id);
      const nameZh = company.company_name;
      const nameEn = company.company_name_en?.trim() || company.company_name;
      return {
        company_id: company.id,
        company_name_en: nameEn,
        company_name_zh: nameZh,
        forms: templates.map((tpl) => ({
          template_id: tpl.id,
          // Templates currently ship a single display name.
          form_name_en: tpl.template_name,
          form_name_zh: tpl.template_name,
          page_count: tpl.page_count,
        })),
      };
    }),
  );
}

export function loadCatalog(): Promise<Catalog> {
  if (cached) return Promise.resolve(cached);
  pending ??= fetchLiveCatalog()
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
