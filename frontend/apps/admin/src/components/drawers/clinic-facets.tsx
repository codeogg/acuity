"use client";

// Clinic drawer facet bodies with writes (provisioning, account/CRM-lite,
// onboarding walkthrough, new-clinic create) — client islands importing the
// server actions directly; the data arrives serialised from the server page.

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Input } from "@acuity/ui";
import { AcuityIcon } from "@acuity/ui";
import { CrmFieldRow } from "@/components/ui/crm-field";
import { ActionButton } from "@/components/ui/action-button";
import { GateButton } from "@/components/ui/confirm-gate";
import { useToast } from "@acuity/ui";
import { clinics } from "@acuity/api-client";
import { MetaBadge } from "@/components/ui/status-badge";
import { MarkdownNotes } from "@/components/ui/markdown-notes";
import {
  createDoctorAction,
  updateClinicAction,
  updateClinicNotesAction,
  updateClinicOpsAction,
} from "@/lib/actions";
import type { ClinicOps } from "@/lib/ops-model";

export interface ClinicSummary {
  id: number;
  code: string;
  name: string;
  name_en: string | null;
  address: string | null;
  phone: string | null;
  idle_lock_minutes: number;
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
  const checklist: { label: string; done: boolean }[] = [
    { label: t("check-basics"), done: Boolean(clinic.name && clinic.address) },
    { label: t("check-residency"), done: true },
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
        value={ops.residency}
        options={[
          { value: "hong-kong", label: t("residency-hk") },
          { value: "singapore", label: t("residency-sg") },
        ]}
        commit={(next) =>
          updateClinicOpsAction(clinic.id, clinic.code, { residency: next as ClinicOps["residency"] })
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
  ops,
  notes,
}: {
  clinic: ClinicSummary;
  ops: ClinicOps;
  notes: string;
}) {
  const t = useTranslations("clinic-drawer.account");

  const patch = (p: Partial<ClinicOps>) => updateClinicOpsAction(clinic.id, clinic.code, p);

  return (
    <div>
      <FacetHeading>{t("commercial")}</FacetHeading>
      <CrmFieldRow
        label={t("subscription")}
        value={ops.subscription}
        options={["trial", "active", "paused", "churned"].map((v) => ({ value: v, label: t(`subscription-${v}`) }))}
        commit={(next) => patch({ subscription: next as ClinicOps["subscription"] })}
        successMessage={t("logged")}
      />
      <CrmFieldRow
        label={t("plan")}
        value={ops.plan}
        options={["starter", "practice", "group"].map((v) => ({ value: v, label: t(`plan-${v}`) }))}
        commit={(next) => patch({ plan: next as ClinicOps["plan"] })}
        successMessage={t("logged")}
      />
      <CrmFieldRow
        label={t("price")}
        value={String(ops.price_hkd_month)}
        commit={(next) => patch({ price_hkd_month: Number(next) || ops.price_hkd_month })}
        successMessage={t("logged")}
      />
      <CrmFieldRow
        label={t("payment")}
        value={ops.payment}
        options={["paid", "unpaid", "overdue"].map((v) => ({ value: v, label: t(`payment-${v}`) }))}
        commit={(next) => patch({ payment: next as ClinicOps["payment"] })}
        successMessage={t("logged")}
      />
      <CrmFieldRow
        label={t("pay-method")}
        value={ops.pay_method}
        options={["bank-transfer", "fps", "cheque", "none"].map((v) => ({ value: v, label: t(`pay-${v}`) }))}
        commit={(next) => patch({ pay_method: next as ClinicOps["pay_method"] })}
        successMessage={t("logged")}
      />

      <FacetHeading className="mt-8">{t("notes")}</FacetHeading>
      <MarkdownNotes
        value={notes}
        commit={(next) => updateClinicNotesAction(clinic.id, clinic.code, next)}
      />

      <FacetHeading className="mt-8">{t("retention")}</FacetHeading>
      <GateButton
        buttonLabel={t("override-retention")}
        buttonIcon="shield"
        buttonVariant="ghost"
        buttonClassName="text-destructive"
        title={t("retention-title")}
        description={t("retention-feedforward", { name: clinic.name_en ?? clinic.name })}
        variant="paste"
        target={clinic.code}
        destructive
        confirmLabel={t("retention-confirm")}
        action={() => patch({ retention_months: ops.retention_months })}
        successMessage={t("retention-done", { name: clinic.name_en ?? clinic.name })}
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
