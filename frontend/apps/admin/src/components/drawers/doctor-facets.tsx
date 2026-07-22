"use client";

// Doctor drawer account facet (dev ADR 0041) — clinic links (many-to-many,
// individual accounts supported), workspace behaviour, sign-in tooling, the
// CRM-lite operational record, and the operator markdown notes. Client
// islands importing the server actions directly.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@acuity/ui";
import { AcuityIcon } from "@acuity/ui";
import { CrmFieldRow } from "@/components/ui/crm-field";
import { ActionButton } from "@/components/ui/action-button";
import { RichNotes, type NoteFormat } from "@/components/ui/markdown-notes";
import { FacetSection } from "@/components/ui/detail";
import { StatusBadge } from "@/components/ui/ui-client";
import { useToast } from "@acuity/ui";
import { DoctorSpecialtySelect } from "@/components/drawers/doctor-specialty-select";
import {
  linkDoctorClinicAction,
  resendInviteAction,
  setDoctorPrimaryClinicAction,
  unlinkDoctorClinicAction,
  unlockDoctorAccountAction,
  updateDoctorAccountAction,
  updateDoctorAction,
  updateDoctorNotesAction,
} from "@/lib/actions";
import type { Tag, WorkspaceSeparation } from "@acuity/types";

export interface LinkedClinicItem {
  id: number;
  code: string;
  name: string;
}

export function DoctorAccountFacet({
  doctorId,
  login,
  email,
  notes,
  notesFormat,
  specialtyTagId,
  specialtyLabel,
  specialtyTags,
  locale,
  workspaceSeparation,
  mfaEnabled,
  primaryClinicId,
  linkedClinics,
  linkableClinics,
}: {
  doctorId: number;
  login: string;
  email: string | null;
  notes: string;
  notesFormat: NoteFormat;
  specialtyTagId: number;
  specialtyLabel: string;
  specialtyTags: Tag[];
  locale: string;
  workspaceSeparation: WorkspaceSeparation;
  mfaEnabled: boolean;
  primaryClinicId: number | null;
  linkedClinics: LinkedClinicItem[];
  linkableClinics: LinkedClinicItem[];
}) {
  const t = useTranslations("doctor-drawer");

  return (
    <div>
      <FacetSection title={t("specialty")}>
        <DoctorSpecialtySelect
          doctorId={doctorId}
          login={login}
          value={specialtyTagId}
          tags={specialtyTags}
          locale={locale}
          fallbackLabel={specialtyLabel}
        />
      </FacetSection>

      <FacetSection title={t("clinic-links")}>
        <ClinicLinks
          doctorId={doctorId}
          login={login}
          primaryClinicId={primaryClinicId}
          linkedClinics={linkedClinics}
          linkableClinics={linkableClinics}
        />
      </FacetSection>

      {linkedClinics.length > 1 ? (
        <FacetSection title={t("workspace")}>
          <CrmFieldRow
            label={t("workspace-separation")}
            value={workspaceSeparation}
            options={[
              { value: "separated", label: t("workspace-separated") },
              { value: "merged", label: t("workspace-merged") },
            ]}
            commit={(next) =>
              updateDoctorAccountAction(doctorId, login, {
                workspace_separation: next as WorkspaceSeparation,
              })
            }
            successMessage={t("workspace-saved")}
          />
          <p className="text-xs text-muted-foreground">{t("workspace-caption")}</p>
        </FacetSection>
      ) : null}

      <FacetSection title={t("sign-in-security")}>
        <CrmFieldRow
          label={t("mfa-opt-in")}
          value={mfaEnabled ? "on" : "off"}
          options={[
            { value: "on", label: t("mfa-on") },
            { value: "off", label: t("mfa-off") },
          ]}
          commit={(next) =>
            updateDoctorAccountAction(doctorId, login, {
              mfa_enabled: next === "on",
            })
          }
          successMessage={t("mfa-opt-in-saved")}
        />
        <p className="mb-3 text-xs text-muted-foreground">{t("mfa-opt-in-caption")}</p>
        <div className="flex flex-wrap gap-2">
          <ActionButton
            label={t("unlock")}
            icon="key"
            action={unlockDoctorAccountAction.bind(null, doctorId, login)}
            successMessage={t("unlock-done")}
          />
          <ActionButton
            label={t("resend-invite")}
            icon="mail"
            action={resendInviteAction.bind(null, doctorId, login)}
            successMessage={t("resend-invite-done")}
          />
        </div>
      </FacetSection>

      <FacetSection title={t("operational-record")}>
        <CrmFieldRow
          label={t("contact-email")}
          value={email ?? ""}
          commit={(next) => updateDoctorAction(doctorId, { email: next.trim() || null })}
          successMessage={t("email-saved")}
        />
      </FacetSection>

      <FacetSection title={t("notes")}>
        <RichNotes
          value={notes}
          format={notesFormat}
          commit={(next, format) => updateDoctorNotesAction(doctorId, login, next, format)}
        />
      </FacetSection>
    </div>
  );
}

function ClinicLinks({
  doctorId,
  login,
  primaryClinicId,
  linkedClinics,
  linkableClinics,
}: {
  doctorId: number;
  login: string;
  primaryClinicId: number | null;
  linkedClinics: LinkedClinicItem[];
  linkableClinics: LinkedClinicItem[];
}) {
  const t = useTranslations("doctor-drawer");
  const [selected, setSelected] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const { showToast } = useToast();

  function link() {
    const clinicId = Number(selected);
    if (!clinicId) return;
    const clinic = linkableClinics.find((c) => c.id === clinicId);
    startTransition(async () => {
      const result = await linkDoctorClinicAction(doctorId, login, clinicId);
      if (result.ok) {
        showToast(t("link-done", { name: clinic?.name ?? String(clinicId) }));
        setSelected("");
        router.refresh();
      } else {
        showToast(result.message, "error");
      }
    });
  }

  function unlink(clinic: LinkedClinicItem) {
    startTransition(async () => {
      const result = await unlinkDoctorClinicAction(doctorId, login, clinic.id);
      if (result.ok) {
        showToast(t("unlink-done", { name: clinic.name }));
        router.refresh();
      } else {
        showToast(result.message, "error");
      }
    });
  }

  function setPrimary(clinicId: string) {
    const id = Number(clinicId);
    if (!id || id === primaryClinicId) return;
    const clinic = linkedClinics.find((c) => c.id === id);
    startTransition(async () => {
      const result = await setDoctorPrimaryClinicAction(doctorId, login, id);
      if (result.ok) {
        showToast(t("primary-saved", { name: clinic?.name ?? String(id) }));
        router.refresh();
      } else {
        showToast(result.message, "error");
      }
    });
  }

  return (
    <div>
      {linkedClinics.length >= 2 ? (
        <div className="mb-3">
          <label className="mb-1.5 block text-xs text-muted-foreground">{t("primary-clinic")}</label>
          <Select
            value={primaryClinicId != null ? String(primaryClinicId) : undefined}
            onValueChange={setPrimary}
            disabled={pending}
          >
            <SelectTrigger aria-label={t("primary-clinic")} className="h-9 w-full">
              <SelectValue placeholder={t("primary-clinic-select")} />
            </SelectTrigger>
            <SelectContent>
              {linkedClinics.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name} · {c.code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      {linkedClinics.length === 0 ? (
        <div className="mb-2 flex items-center gap-2">
          <StatusBadge tone="accent" appearance="outline" label={t("individual")} />
          <span className="text-sm text-muted-foreground">{t("individual-caption")}</span>
        </div>
      ) : (
        linkedClinics.map((clinic) => (
          <div key={clinic.id} className="flex items-center gap-3 border-b border-border py-2.5 last:border-0">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-foreground">{clinic.name}</div>
              <div className="font-mono text-xs text-muted-foreground">{clinic.code}</div>
            </div>
            {clinic.id === primaryClinicId ? (
              <StatusBadge tone="info" appearance="outline" label={t("primary")} />
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => unlink(clinic)}
              disabled={pending}
              aria-label={t("unlink-label", { name: clinic.name })}
            >
              <AcuityIcon name="x" size={16} />
              {t("unlink")}
            </Button>
          </div>
        ))
      )}
      {linkableClinics.length > 0 ? (
        <div className="mt-3 flex items-center gap-2">
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger aria-label={t("link-select")} className="h-9 flex-1">
              <SelectValue placeholder={t("link-select")} />
            </SelectTrigger>
            <SelectContent>
              {linkableClinics.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name} · {c.code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="button" variant="outline" size="sm" onClick={link} disabled={pending || !selected}>
            <AcuityIcon name="plus" size={16} />
            {t("link")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
