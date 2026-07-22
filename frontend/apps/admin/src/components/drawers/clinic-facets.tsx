"use client";

// Clinic drawer facet bodies with writes (provisioning, account/CRM-lite,
// onboarding walkthrough, new-clinic create) — client islands importing the
// server actions directly; the data arrives serialised from the server page.

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Input, cn } from "@acuity/ui";
import { AcuityIcon } from "@acuity/ui";
import { CrmFieldRow } from "@/components/ui/crm-field";
import { ActionButton } from "@/components/ui/action-button";
import { GateButton } from "@/components/ui/confirm-gate";
import { useToast } from "@acuity/ui";
import { clinics, districts } from "@acuity/api-client";
import type {
  ClinicConfigOverview,
  ClinicRetentionAuditOut,
  ClinicRetentionOut,
  ClinicSubscriptionOut,
  ClinicSubscriptionUpdate,
  CompanyConfigItem,
} from "@acuity/types";
import { MetaBadge } from "@/components/ui/status-badge";
import { RichNotes, type NoteFormat } from "@/components/ui/markdown-notes";
import { RetentionOverridePanel } from "@/components/drawers/retention-override-panel";
import {
  createDoctorAction,
  setClinicCompanyEnablementAction,
  setClinicCompanyTemplatesAction,
  setClinicTemplateEnablementAction,
  updateClinicAction,
  updateClinicOpsAction,
  updateClinicSubscriptionAction,
  updateClinicSubscriptionNoteAction,
} from "@/lib/actions";
import type { ClinicOps } from "@/lib/ops-model";

type DistrictOption = Awaited<ReturnType<typeof districts.listDistricts>>[number];

function districtSelectOptions(items: DistrictOption[]) {
  return [
    { value: "none", label: "—" },
    ...items.map((d) => ({
      value: String(d.id),
      label: d.region ? `${d.name_zh}（${d.region}）` : d.name_zh,
    })),
  ];
}

function useDistrictOptions() {
  const [items, setItems] = useState<DistrictOption[]>([]);
  useEffect(() => {
    let cancelled = false;
    districts
      .listDistricts()
      .then((rows) => {
        if (!cancelled) setItems(rows);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return items;
}

export interface ClinicSummary {
  id: number;
  code: string;
  name: string;
  name_en: string | null;
  address: string | null;
  phone: string | null;
  idle_lock_minutes: number;
  district_id: number | null;
  data_region: string;
  is_flagged: number;
}

// --- provisioning facet -----------------------------------------------------------

export function ProvisioningFacet({
  clinic,
  ops,
  doctorCount,
  insurers,
  signatureUploaded,
}: {
  clinic: ClinicSummary;
  ops: ClinicOps;
  doctorCount: number;
  insurers: string[];
  signatureUploaded: boolean;
}) {
  const t = useTranslations("clinic-drawer.provisioning");
  const districtOptions = useDistrictOptions();
  const checklist: { label: string; done: boolean }[] = [
    { label: t("check-basics"), done: Boolean(clinic.name && clinic.address) },
    { label: t("check-residency"), done: Boolean(clinic.data_region) },
    { label: t("check-doctor"), done: doctorCount >= 1 },
    { label: t("check-defaults"), done: insurers.length > 0 },
  ];

  return (
    <div>
      <div className="mb-6 rounded-lg border border-border bg-muted/60 p-4">
        <div className="mb-2 font-mono text-xs font-medium uppercase tracking-eyebrow text-muted-foreground">
          {t("whats-left")}
        </div>
        {checklist.map((item, i) => (
          <div key={i} className="flex items-center gap-2 py-1.5">
            <span className={`flex ${item.done ? "text-success" : "text-muted-foreground"}`}>
              <AcuityIcon name={item.done ? "check" : "dot"} size={16} />
            </span>
            <span className={`text-sm ${item.done ? "text-foreground" : "text-muted-foreground"}`}>
              {item.label}
            </span>
          </div>
        ))}
      </div>

      <FacetHeading>{t("basics")}</FacetHeading>
      <CrmFieldRow
        label={t("name-zh")}
        value={clinic.name}
        commit={(next) => updateClinicAction(clinic.id, { clinic_name: next.trim() })}
      />
      <CrmFieldRow
        label={t("name-en")}
        value={clinic.name_en ?? ""}
        commit={(next) =>
          updateClinicAction(clinic.id, { clinic_name_en: next.trim() || null })
        }
      />
      <CrmFieldRow
        label={t("district")}
        value={clinic.district_id != null ? String(clinic.district_id) : "none"}
        options={districtSelectOptions(districtOptions)}
        commit={(next) =>
          updateClinicAction(clinic.id, {
            district_id: next === "none" || !next ? null : Number(next),
          })
        }
      />
      <CrmFieldRow
        label={t("address")}
        value={clinic.address ?? ""}
        commit={(next) => updateClinicAction(clinic.id, { address: next })}
      />
      <CrmFieldRow
        label={t("phone")}
        value={clinic.phone ?? ""}
        commit={(next) => updateClinicAction(clinic.id, { phone: next })}
      />
      <CrmFieldRow
        label={t("residency")}
        value={clinic.data_region || "香港"}
        options={[
          { value: "香港", label: t("residency-hk") },
          { value: "新加坡", label: t("residency-sg") },
          { value: "美国", label: t("residency-us") },
        ]}
        commit={(next) =>
          updateClinicAction(clinic.id, {
            data_region: next as "香港" | "新加坡" | "美国",
          })
        }
      />

      <FacetHeading>{t("accounts")}</FacetHeading>
      <p className="mb-2 text-sm text-muted-foreground">{t("accounts-summary", { count: doctorCount })}</p>
      <AddDoctorForm clinicId={clinic.id} />

      <FacetHeading className="mt-8">{t("defaults")}</FacetHeading>
      <div className="flex items-center justify-between gap-4 border-b border-border py-2.5">
        <span className="text-sm text-muted-foreground">{t("signature")}</span>
        <MetaBadge
          meta={
            signatureUploaded
              ? { tone: "success", icon: "check", key: "" }
              : { tone: "warning", icon: "alert", key: "" }
          }
          label={signatureUploaded ? t("signature-uploaded") : t("signature-missing")}
        />
      </div>
      <div className="flex items-center justify-between gap-4 border-b border-border py-2.5">
        <span className="text-sm text-muted-foreground">{t("default-insurers")}</span>
        <span className="text-right text-sm font-medium text-foreground">
          {insurers.length ? insurers.join(", ") : "—"}
        </span>
      </div>
      <div className="mt-3.5">
        <CrmFieldRow
          label={t("idle-lock")}
          value={String(clinic.idle_lock_minutes)}
          commit={(next) =>
            updateClinicAction(clinic.id, {
              idle_lock_minutes: Number(next) || 10,
            })
          }
        />
      </div>

      <div className="mt-4 flex justify-end">
        <ActionButton
          label={t("save")}
          variant="default"
          size="default"
          action={() => updateClinicOpsAction(clinic.id, clinic.code, {})}
          successMessage={t("saved")}
        />
      </div>
    </div>
  );
}

function AddDoctorForm({ clinicId }: { clinicId: number }) {
  const t = useTranslations("clinic-drawer.provisioning");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [login, setLogin] = useState("");
  const [email, setEmail] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const { showToast } = useToast();

  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <AcuityIcon name="plus" size={16} />
        {t("add-doctor")}
      </Button>
    );
  }

  function submit() {
    if (!name || !login) return;
    startTransition(async () => {
      const result = await createDoctorAction({
        clinic_id: clinicId,
        doctor_name: name,
        doctor_name_en: name,
        login_account: login,
        email: email.trim() || null,
        password: "changeme-on-first-signin",
      });
      if (result.ok) {
        showToast(t("doctor-created", { login }));
        setOpen(false);
        setName("");
        setLogin("");
        setEmail("");
        router.refresh();
      } else {
        showToast(result.message, "error");
      }
    });
  }

  return (
    <div className="rounded-md border border-border p-3">
      <div className="mb-2 grid grid-cols-2 gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("doctor-name")}
          aria-label={t("doctor-name")}
          className="h-9"
        />
        <Input
          value={login}
          onChange={(e) => setLogin(e.target.value)}
          placeholder={t("doctor-login")}
          aria-label={t("doctor-login")}
          className="h-9"
        />
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("doctor-email")}
          aria-label={t("doctor-email")}
          autoComplete="email"
          className="h-9 col-span-2"
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          {t("cancel")}
        </Button>
        <Button type="button" size="sm" onClick={submit} disabled={pending || !name || !login}>
          {t("create-doctor")}
        </Button>
      </div>
    </div>
  );
}

// --- account facet (CRM-lite) --------------------------------------------------------

export function AccountFacet({
  clinic,
  subscription,
  retention,
  retentionHistory,
  locale,
}: {
  clinic: ClinicSummary;
  subscription: ClinicSubscriptionOut;
  retention: ClinicRetentionOut;
  retentionHistory: ClinicRetentionAuditOut[];
  locale: string;
}) {
  const t = useTranslations("clinic-drawer.account");

  const patchSub = (p: ClinicSubscriptionUpdate) =>
    updateClinicSubscriptionAction(clinic.id, clinic.code, p);

  const plan = subscription.plan_code ?? "starter";
  const price = subscription.price != null ? String(subscription.price) : "";
  const payment = subscription.payment_status ?? "unpaid";
  const payMethod = subscription.payment_method ?? "other";

  return (
    <div>
      <FacetHeading>{t("commercial")}</FacetHeading>
      <CrmFieldRow
        label={t("subscription")}
        value={subscription.subscription_status}
        options={["trial", "active", "cancelled", "expired"].map((v) => ({
          value: v,
          label: t(`subscription-${v}`),
        }))}
        commit={(next) =>
          patchSub({
            subscription_status: next as ClinicSubscriptionOut["subscription_status"],
          })
        }
        successMessage={t("logged")}
      />
      <CrmFieldRow
        label={t("plan")}
        value={plan}
        options={["starter", "practice", "group"].map((v) => ({ value: v, label: t(`plan-${v}`) }))}
        commit={(next) => patchSub({ plan_code: next })}
        successMessage={t("logged")}
      />
      <CrmFieldRow
        label={t("price")}
        value={price}
        commit={(next) => patchSub({ price: Number(next) || 0, currency: subscription.currency || "HKD" })}
        successMessage={t("logged")}
      />
      <CrmFieldRow
        label={t("payment")}
        value={payment}
        options={["paid", "unpaid", "overdue", "refunded"].map((v) => ({
          value: v,
          label: t(`payment-${v}`),
        }))}
        commit={(next) =>
          patchSub({ payment_status: next as ClinicSubscriptionOut["payment_status"] })
        }
        successMessage={t("logged")}
      />
      <CrmFieldRow
        label={t("pay-method")}
        value={payMethod}
        options={["bank_transfer", "credit_card", "cheque", "other"].map((v) => ({
          value: v,
          label: t(`pay-${v}`),
        }))}
        commit={(next) =>
          patchSub({ payment_method: next as ClinicSubscriptionOut["payment_method"] })
        }
        successMessage={t("logged")}
      />

      <FacetHeading className="mt-8">{t("notes")}</FacetHeading>
      <RichNotes
        value={subscription.note_content ?? ""}
        format={(subscription.note_format as NoteFormat) || "markdown"}
        commit={(next, format) =>
          updateClinicSubscriptionNoteAction(clinic.id, clinic.code, next, format)
        }
      />

      <FacetHeading className="mt-8">{t("retention")}</FacetHeading>
      <RetentionOverridePanel
        clinicId={clinic.id}
        clinicCode={clinic.code}
        clinicName={clinic.name_en ?? clinic.name}
        retention={retention}
        history={retentionHistory}
        locale={locale}
      />
    </div>
  );
}

// --- onboarding walkthrough facet -----------------------------------------------------

export function OnboardingFacet({ clinic, ops }: { clinic: ClinicSummary; ops: ClinicOps }) {
  const t = useTranslations("clinic-drawer.onboarding");
  const [feedback, setFeedback] = useState("");
  const { showToast } = useToast();
  const steps = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => t(`step-${n}`));
  const current = ops.onboarding_step;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <div>
        <div className="mb-3 font-mono text-xs font-medium uppercase tracking-eyebrow text-muted-foreground">
          {t("progress", { current: Math.min(current + 1, 8), total: 8 })}
        </div>
        {steps.map((step, i) => (
          <div key={i} className="flex items-center gap-2.5 py-2">
            <span
              className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs ${
                i < current
                  ? "bg-success text-success-foreground"
                  : i === current
                    ? "bg-primary text-primary-foreground"
                    : "border border-border bg-muted text-muted-foreground"
              }`}
            >
              {i < current ? <AcuityIcon name="check" size={12} /> : i + 1}
            </span>
            <span className={`text-sm ${i <= current ? "text-foreground" : "text-muted-foreground"}`}>{step}</span>
          </div>
        ))}
      </div>
      <div>
        <div className="mb-4 overflow-hidden rounded-lg border border-border">
          <div className="flex items-center gap-2 border-b border-border px-3.5 py-2.5">
            <span className="flex text-info">
              <AcuityIcon name="eye" size={16} />
            </span>
            <span className="text-xs text-muted-foreground">{t("preview-caption")}</span>
          </div>
          <div
            className="flex h-48 items-center justify-center bg-muted"
            style={{
              background:
                "repeating-linear-gradient(135deg, var(--caliber-cream-contrast), var(--caliber-cream-contrast) 12px, color-mix(in srgb, var(--caliber-cream-contrast) 60%, var(--caliber-cream)) 12px, color-mix(in srgb, var(--caliber-cream-contrast) 60%, var(--caliber-cream)) 24px)",
            }}
          >
            <span className="rounded-md bg-background px-2.5 py-1 font-mono text-xs text-muted-foreground">
              {t("preview-placeholder")}
            </span>
          </div>
        </div>
        <div className="mb-1.5 font-mono text-xs font-medium uppercase tracking-eyebrow text-muted-foreground">
          {t("feedback")}
        </div>
        <div className="mb-1.5 flex items-center gap-1 text-xs text-info">
          <AcuityIcon name="info" size={13} />
          {t("feedback-note")}
        </div>
        <textarea
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={feedback}
          rows={3}
          aria-label={t("feedback")}
          placeholder={t("feedback-placeholder")}
          onChange={(e) => setFeedback(e.target.value)}
        />
        <div className="mt-2.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              showToast(t("feedback-captured"));
              setFeedback("");
            }}
            disabled={!feedback.trim()}
          >
            {t("capture-feedback")}
          </Button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">{t("clinic-context", { code: clinic.code })}</p>
      </div>
    </div>
  );
}

// --- new clinic (create) ---------------------------------------------------------------

export function NewClinicForm() {
  const t = useTranslations("clinic-drawer.new");
  const searchParams = useSearchParams();
  const [name, setName] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [districtId, setDistrictId] = useState("");
  const districtOptions = useDistrictOptions();
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const { showToast } = useToast();

  function submit() {
    if (!name.trim()) return;
    startTransition(async () => {
      try {
        // This is a browser-originated mutation. Calling the same-origin API
        // directly lets fetch include the httpOnly access_token cookie, rather
        // than relying on a Server Action relay for this first provisioning
        // step.
        const clinic = await clinics.createClinic({
          clinic_name: name.trim(),
          clinic_name_en: nameEn.trim() || null,
          address: address.trim() || null,
          phone: phone.trim() || null,
          district_id: districtId ? Number(districtId) : null,
        });
        showToast(t("created", { name: nameEn.trim() || name.trim() }));
        const params = new URLSearchParams(searchParams.toString());
        params.delete("new");
        params.set("open", String(clinic.id));
        params.set("facet", "provisioning");
        router.replace(`?${params.toString()}`, { scroll: false });
        router.refresh();
      } catch (error) {
        showToast(error instanceof Error ? error.message : "Unable to create clinic", "error");
      }
    });
  }

  const field = (label: string, value: string, set: (v: string) => void) => (
    <div className="mb-3.5">
      <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
      <Input value={value} onChange={(e) => set(e.target.value)} aria-label={label} className="h-9" />
    </div>
  );

  return (
    <div>
      <p className="mb-4 text-sm text-muted-foreground">{t("intro")}</p>
      {field(t("name-zh"), name, setName)}
      {field(t("name-en"), nameEn, setNameEn)}
      <div className="mb-3.5">
        <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="new-clinic-district">
          {t("district")}
        </label>
        <select
          id="new-clinic-district"
          className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground"
          value={districtId}
          onChange={(e) => setDistrictId(e.target.value)}
          aria-label={t("district")}
        >
          <option value="">—</option>
          {districtOptions.map((d) => (
            <option key={d.id} value={d.id}>
              {d.region ? `${d.name_zh}（${d.region}）` : d.name_zh}
            </option>
          ))}
        </select>
      </div>
      {field(t("address"), address, setAddress)}
      {field(t("phone"), phone, setPhone)}
      <div className="mt-4 flex justify-end">
        <Button type="button" onClick={submit} disabled={pending || !name.trim()}>
          <AcuityIcon name="plus" size={16} />
          {t("create")}
        </Button>
      </div>
    </div>
  );
}

function FacetHeading({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <h3 className={`mb-3 font-mono text-xs font-medium uppercase tracking-eyebrow text-muted-foreground ${className ?? ""}`}>
      {children}
    </h3>
  );
}

// --- insurers / templates facet (clinic config) -----------------------------------

function patchCompanyLocal(
  companies: CompanyConfigItem[],
  companyId: number,
  updater: (c: CompanyConfigItem) => CompanyConfigItem,
): CompanyConfigItem[] {
  return companies.map((c) => (c.company_id === companyId ? updater(c) : c));
}

export function InsurersFacet({
  clinicId,
  initialConfig,
}: {
  clinicId: number;
  initialConfig: ClinicConfigOverview | null;
}) {
  const t = useTranslations("clinic-drawer.insurers");
  const { showToast } = useToast();
  const [companies, setCompanies] = useState<CompanyConfigItem[]>(
    initialConfig?.companies ?? [],
  );
  const [search, setSearch] = useState("");
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setCompanies(initialConfig?.companies ?? []);
  }, [initialConfig]);

  useEffect(() => {
    if (selectedCompanyId !== null || companies.length === 0) return;
    const first = companies.find((c) => c.enabled) ?? companies[0];
    if (first) setSelectedCompanyId(first.company_id);
  }, [companies, selectedCompanyId]);

  const filtered = useMemo(() => {
    const kw = search.trim().toLowerCase();
    if (!kw) return companies;
    return companies.filter((c) => c.company_name.toLowerCase().includes(kw));
  }, [companies, search]);

  const selected = companies.find((c) => c.company_id === selectedCompanyId) ?? null;

  function companyLabel(c: CompanyConfigItem): string {
    return c.company_name;
  }

  function toggleCompany(company: CompanyConfigItem) {
    const next = !company.enabled;
    setCompanies((prev) =>
      patchCompanyLocal(prev, company.company_id, (c) => ({ ...c, enabled: next })),
    );
    startTransition(async () => {
      const result = await setClinicCompanyEnablementAction(
        clinicId,
        company.company_id,
        next,
      );
      if (!result.ok) {
        setCompanies((prev) =>
          patchCompanyLocal(prev, company.company_id, (c) => ({ ...c, enabled: !next })),
        );
        showToast(result.message, "error");
        return;
      }
      showToast(next ? t("company-enabled") : t("company-disabled"));
    });
  }

  function toggleTemplate(company: CompanyConfigItem, templateId: number, current: boolean) {
    const next = !current;
    setCompanies((prev) =>
      patchCompanyLocal(prev, company.company_id, (c) => {
        const templates = c.templates.map((tpl) =>
          tpl.template_id === templateId ? { ...tpl, enabled: next } : tpl,
        );
        return {
          ...c,
          templates,
          enabled_template_count: templates.filter((tpl) => tpl.enabled).length,
        };
      }),
    );
    startTransition(async () => {
      const result = await setClinicTemplateEnablementAction(clinicId, templateId, next);
      if (!result.ok) {
        setCompanies((prev) =>
          patchCompanyLocal(prev, company.company_id, (c) => {
            const templates = c.templates.map((tpl) =>
              tpl.template_id === templateId ? { ...tpl, enabled: !next } : tpl,
            );
            return {
              ...c,
              templates,
              enabled_template_count: templates.filter((tpl) => tpl.enabled).length,
            };
          }),
        );
        showToast(result.message, "error");
        return;
      }
      showToast(next ? t("template-enabled") : t("template-disabled"));
    });
  }

  function selectAll(company: CompanyConfigItem, all: boolean) {
    const ids = all
      ? company.templates.filter((tpl) => tpl.is_active).map((tpl) => tpl.template_id)
      : [];
    const idSet = new Set(ids);
    const previous = company.templates.map((tpl) => ({ ...tpl }));
    setCompanies((prev) =>
      patchCompanyLocal(prev, company.company_id, (c) => {
        const templates = c.templates.map((tpl) => ({
          ...tpl,
          enabled: idSet.has(tpl.template_id),
        }));
        return {
          ...c,
          templates,
          enabled_template_count: templates.filter((tpl) => tpl.enabled).length,
        };
      }),
    );
    startTransition(async () => {
      const result = await setClinicCompanyTemplatesAction(
        clinicId,
        company.company_id,
        ids,
      );
      if (!result.ok) {
        setCompanies((prev) =>
          patchCompanyLocal(prev, company.company_id, (c) => ({
            ...c,
            templates: previous,
            enabled_template_count: previous.filter((tpl) => tpl.enabled).length,
          })),
        );
        showToast(result.message, "error");
        return;
      }
      const enabledSet = new Set(result.data?.enabled_template_ids ?? ids);
      setCompanies((prev) =>
        patchCompanyLocal(prev, company.company_id, (c) => {
          const templates = c.templates.map((tpl) => ({
            ...tpl,
            enabled: enabledSet.has(tpl.template_id),
          }));
          return {
            ...c,
            templates,
            enabled_template_count: templates.filter((tpl) => tpl.enabled).length,
          };
        }),
      );
      showToast(t("bulk-saved"));
    });
  }

  if (!initialConfig) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="insurers-load-error">
        {t("load-error")}
      </p>
    );
  }

  if (companies.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">{t("empty-companies")}</p>
    );
  }

  return (
    <div>
      <p className="mb-4 text-sm text-muted-foreground">{t("description")}</p>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,240px)_minmax(0,1fr)]">
        <div className="rounded-lg border border-border bg-card p-3">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("search-company")}
            aria-label={t("search-company")}
            className="mb-3 h-9"
          />
          <div className="flex max-h-[28rem] flex-col gap-1.5 overflow-y-auto">
            {filtered.map((company) => {
              const active = company.company_id === selectedCompanyId;
              return (
                <button
                  key={company.company_id}
                  type="button"
                  onClick={() => setSelectedCompanyId(company.company_id)}
                  className={cn(
                    "flex items-center justify-between gap-2 rounded-md border px-3 py-2.5 text-left transition-colors",
                    active
                      ? "border-primary bg-muted/60"
                      : "border-transparent hover:bg-muted/40",
                    company.enabled ? "" : "opacity-60",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-foreground">
                      {companyLabel(company)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {company.enabled
                        ? t("selected-templates", {
                            enabled: company.enabled_template_count,
                            total: company.template_count,
                          })
                        : t("not-enabled")}
                    </div>
                  </div>
                  <span
                    role="switch"
                    aria-checked={company.enabled}
                    aria-label={t("toggle-company")}
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleCompany(company);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                        toggleCompany(company);
                      }
                    }}
                    className={cn(
                      "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors",
                      company.enabled ? "bg-primary" : "bg-muted",
                      pending ? "pointer-events-none opacity-70" : "",
                    )}
                  >
                    <span
                      className={cn(
                        "inline-block size-4 rounded-full bg-background shadow transition-transform",
                        company.enabled ? "translate-x-4" : "translate-x-0.5",
                      )}
                    />
                  </span>
                </button>
              );
            })}
            {filtered.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">{t("no-company-matches")}</p>
            ) : null}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          {!selected ? (
            <p className="text-sm text-muted-foreground">{t("pick-company")}</p>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-medium text-foreground">{companyLabel(selected)}</div>
                  <div className="text-xs text-muted-foreground">{t("templates-heading")}</div>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!selected.enabled || pending}
                    onClick={() => selectAll(selected, true)}
                  >
                    {t("select-all")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!selected.enabled || pending}
                    onClick={() => selectAll(selected, false)}
                  >
                    {t("clear-all")}
                  </Button>
                </div>
              </div>

              {!selected.enabled ? (
                <p className="mb-3 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  {t("enable-company-first")}
                </p>
              ) : null}

              {selected.templates.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("no-templates")}</p>
              ) : (
                <ul className="divide-y divide-border">
                  {selected.templates.map((tpl) => {
                    const disabled = !selected.enabled || !tpl.is_active || pending;
                    return (
                      <li key={tpl.template_id} className="flex items-start gap-3 py-3">
                        <input
                          type="checkbox"
                          className="mt-1 size-4 accent-primary"
                          checked={tpl.enabled}
                          disabled={disabled}
                          onChange={() => toggleTemplate(selected, tpl.template_id, tpl.enabled)}
                          aria-label={tpl.template_name}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-foreground">
                            {tpl.template_name}
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <span>{t("template-meta", { version: tpl.version })}</span>
                            <MetaBadge
                              meta={
                                tpl.is_active
                                  ? { tone: "success", icon: "check", key: "" }
                                  : { tone: "neutral", icon: "dot", key: "" }
                              }
                              label={tpl.is_active ? t("published") : t("unpublished")}
                            />
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
