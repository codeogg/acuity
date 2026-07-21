"use client";

// Form selection (loop step 0) — clinic-scoped cascade matching the backend
// doctor new-claim order:
//   1. list insurers bound to the session clinic
//   2. pick an insurer → list published templates enabled for clinic+company
//   3. pick a template → create DRAFT → route into intake (PDF / paste)

import { useMemo, useState } from "react";
import { useRouter } from "@acuity/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ApiError, claims } from "@acuity/api-client";
import type { ClaimOut, CompanyBrief, TemplateBrief } from "@acuity/types";
import {
  ArrowLeftIcon,
  Button,
  CheckIcon,
  Input,
  SearchIcon,
  TemplateIcon,
  cn,
} from "@acuity/ui";
import type { Locale } from "@/i18n/routing";
import { useApi } from "@/lib/use-api";
import { useApiErrorMessage } from "@/lib/api-error";
import { Eyebrow } from "@/components/ui/page";
import { LoopScaffold } from "@/components/loop/loop-scaffold";
import { CardListSkeleton } from "@/components/ui/loaders";
import { EmptyPanel, ErrorPanel } from "@/components/ui/states";

type Phase = "company" | "template";

function companyLabel(company: CompanyBrief, locale: Locale): string {
  if (locale === "zh-Hant-HK") return company.company_name;
  return company.company_name_en ?? company.company_name;
}

function companyAlt(company: CompanyBrief, locale: Locale): string | null {
  if (locale === "zh-Hant-HK") return company.company_name_en ?? null;
  return company.company_name_en ? company.company_name : null;
}

export function FormSelection() {
  const t = useTranslations("form-selection");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const apiMessage = useApiErrorMessage();

  const companies = useApi(() => claims.listEnabledCompanies());

  const [phase, setPhase] = useState<Phase>("company");
  const [query, setQuery] = useState("");
  const [selectedCompany, setSelectedCompany] = useState<CompanyBrief | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateBrief | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<ApiError | null>(null);

  const templates = useApi(
    () =>
      selectedCompany
        ? claims.listCompanyTemplates(selectedCompany.id)
        : Promise.resolve([] as TemplateBrief[]),
    [selectedCompany?.id],
  );

  const filteredCompanies = useMemo(() => {
    const list = companies.data ?? [];
    const needle = query.trim().toLowerCase();
    if (!needle || phase !== "company") return list;
    return list.filter((c) =>
      [c.company_name, c.company_name_en ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [companies.data, query, phase]);

  const filteredTemplates = useMemo(() => {
    const list = templates.data ?? [];
    const needle = query.trim().toLowerCase();
    if (!needle || phase !== "template") return list;
    return list.filter((tpl) =>
      [tpl.template_name, tpl.version].join(" ").toLowerCase().includes(needle),
    );
  }, [templates.data, query, phase]);

  function pickCompany(company: CompanyBrief) {
    setSelectedCompany(company);
    setSelectedTemplate(null);
    setQuery("");
    setCreateError(null);
    setPhase("template");
  }

  function backToCompanies() {
    setPhase("company");
    setSelectedTemplate(null);
    setQuery("");
    setCreateError(null);
  }

  async function handleContinue() {
    if (!selectedCompany || !selectedTemplate) return;
    setCreating(true);
    setCreateError(null);
    try {
      const created: ClaimOut = await claims.createClaim({
        company_id: selectedCompany.id,
        template_id: selectedTemplate.id,
      });
      router.push(`/forms/${created.id}/intake`);
    } catch (cause) {
      setCreateError(cause instanceof ApiError ? cause : null);
      setCreating(false);
    }
  }

  const footerSelected =
    selectedCompany && selectedTemplate
      ? t("footer-selected", {
          company: companyLabel(selectedCompany, locale),
          form: selectedTemplate.template_name,
        })
      : selectedCompany
        ? t("footer-company-only", {
            company: companyLabel(selectedCompany, locale),
          })
        : t("footer-unselected");

  const loadingCompanies = companies.loading && !companies.data;
  const loadingTemplates =
    phase === "template" && templates.loading && selectedCompany != null;

  return (
    <LoopScaffold
      step={0}
      heading={phase === "company" ? t("step-heading-company") : t("step-heading-template")}
      confirmLeave={false}
      footerStart={footerSelected}
      footerEnd={
        <Button
          size="lg"
          disabled={!selectedCompany || !selectedTemplate || creating}
          loading={creating}
          onClick={handleContinue}
        >
          {t("continue")}
        </Button>
      }
    >
      {phase === "template" && selectedCompany ? (
        <button
          type="button"
          onClick={backToCompanies}
          className="mb-4 inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
        >
          <ArrowLeftIcon size={16} aria-hidden />
          {t("back-companies")}
        </button>
      ) : null}

      {phase === "template" && selectedCompany ? (
        <p className="mb-4 text-sm text-muted-foreground">
          {t("templates-for", { company: companyLabel(selectedCompany, locale) })}
        </p>
      ) : null}

      <div className="relative mb-6">
        <SearchIcon
          size={20}
          className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={
            phase === "company" ? t("search-company-placeholder") : t("search-template-placeholder")
          }
          aria-label={
            phase === "company" ? t("search-company-placeholder") : t("search-template-placeholder")
          }
          className="h-12 pl-10 text-base"
        />
      </div>

      {companies.error ? (
        <ErrorPanel title={t("load-error")} description={apiMessage(companies.error)} />
      ) : null}

      {phase === "company" ? (
        loadingCompanies ? (
          <CardListSkeleton count={4} label={t("loading-insurers")} />
        ) : (companies.data?.length ?? 0) === 0 ? (
          <EmptyPanel title={t("no-companies-title")} description={t("no-companies-description")} />
        ) : filteredCompanies.length === 0 ? (
          <EmptyPanel
            title={t("no-match-title", { query: query.trim() })}
            description={t("no-company-matches")}
          />
        ) : (
          <div>
            <Eyebrow className="mb-2.5">
              {query.trim() ? t("results") : t("all-insurers")}
            </Eyebrow>
            <div className="grid gap-3 sm:grid-cols-2">
              {filteredCompanies.map((company) => {
                const active = selectedCompany?.id === company.id;
                const alt = companyAlt(company, locale);
                return (
                  <button
                    key={company.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => pickCompany(company)}
                    className={cn(
                      "flex flex-col gap-1 rounded-md border bg-card p-4 text-left transition-colors duration-[120ms]",
                      "cursor-pointer hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                      active
                        ? "border-primary ring-1 ring-inset ring-primary"
                        : "border-border",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-base font-medium text-foreground">
                          {companyLabel(company, locale)}
                        </p>
                        {alt ? (
                          <p className="truncate text-sm text-muted-foreground">{alt}</p>
                        ) : null}
                      </div>
                      {active ? (
                        <span
                          aria-hidden
                          className="flex size-5.5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
                        >
                          <CheckIcon size={13} />
                        </span>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )
      ) : loadingTemplates ? (
        <CardListSkeleton count={4} label={t("loading-templates")} />
      ) : templates.error ? (
        <ErrorPanel title={t("load-error")} description={apiMessage(templates.error)} />
      ) : (templates.data?.length ?? 0) === 0 ? (
        <EmptyPanel title={t("no-templates-title")} description={t("no-templates-description")} />
      ) : filteredTemplates.length === 0 ? (
        <EmptyPanel
          title={t("no-match-title", { query: query.trim() })}
          description={t("no-template-matches")}
        />
      ) : (
        <div>
          <Eyebrow className="mb-2.5">
            {query.trim() ? t("results") : t("all-templates")}
          </Eyebrow>
          <div className="grid gap-3 sm:grid-cols-2">
            {filteredTemplates.map((template) => {
              const active = selectedTemplate?.id === template.id;
              return (
                <button
                  key={template.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setSelectedTemplate(template)}
                  className={cn(
                    "flex items-start gap-3 rounded-md border bg-card p-4 text-left transition-colors duration-[120ms]",
                    "cursor-pointer hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                    active
                      ? "border-primary ring-1 ring-inset ring-primary"
                      : "border-border",
                  )}
                >
                  <TemplateIcon
                    size={20}
                    className="mt-0.5 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-medium text-foreground">
                      {template.template_name}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {t("template-meta", {
                        version: template.version,
                        pages: template.page_count,
                      })}
                    </p>
                  </div>
                  {active ? (
                    <span
                      aria-hidden
                      className="flex size-5.5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
                    >
                      <CheckIcon size={13} />
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {createError ? (
        <div className="mt-4">
          <ErrorPanel title={t("create-error")} description={apiMessage(createError)} />
        </div>
      ) : null}
    </LoopScaffold>
  );
}
