"use server";

// Console server actions — every state-transitioning write goes through the
// typed contract endpoints server-side (overview.md: writes use Server
// Actions), so the mock backend (node-side MSW) and a real backend are the
// same seam. Each action returns a typed outcome the client surfaces as a
// toast / inline state; consequential actions also record their audit event
// where the mock handler does not already do so.

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { api, ApiError, audit as auditApi, companies, doctors, fields, frontendOnly, templates } from "@acuity/api-client";
import type { DoctorAccountExtension } from "@acuity/api-client";
import type {
  AuditActionType,
  ClinicCreate,
  ClinicOut,
  ClinicRetentionOut,
  ClinicSubscriptionOut,
  ClinicSubscriptionUpdate,
  ClinicUpdate,
  CompanyCreate,
  CompanyUpdate,
  DoctorAccountOut,
  DoctorCreate,
  DoctorUpdate,
  FieldMappingSave,
  StandardFieldCreate,
  Tag,
  TagRetireResult,
  TemplateFieldCreate,
  TemplateFieldOut,
  TemplateFieldUpdate,
} from "@acuity/types";
import {
  updateClinicOps,
  updateDoctorOps,
  updateOperatorProfile,
  type ClinicOps,
  type DoctorOps,
} from "./ops-model";

const {
  accountManagement,
  adminImpersonation,
  adminSavedViews,
  adminTickets,
  adminAnalytics,
} = frontendOnly;

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; kind: string; message: string };

function failure(err: unknown): { ok: false; kind: string; message: string } {
  if (err instanceof ApiError) return { ok: false, kind: err.kind, message: err.message };
  return { ok: false, kind: "unknown", message: err instanceof Error ? err.message : String(err) };
}

async function sessionHeaders(): Promise<Record<string, string>> {
  const cookie = (await cookies()).toString();
  return cookie ? { cookie } : {};
}

// Server Actions execute in Next.js, not in the browser. Explicitly pass the
// request cookie when proxying a mutation to FastAPI, otherwise the backend
// correctly rejects it as an unauthenticated request.
async function clinicMutation<T>(
  method: "post" | "put" | "patch" | "delete",
  path: string,
  body?: unknown,
): Promise<T> {
  // Server Actions do not need the browser-facing Next rewrite. Going straight
  // to FastAPI avoids the action-to-Next proxy hop where the session context
  // can be lost, while the explicit Cookie header keeps the call authenticated.
  //
  // api.post/put/patch signature is (path, json?, options?) — the body must be
  // the second argument. Passing an options bag as json silently no-ops updates
  // (extra keys ignored by the backend), which broke logo_url and other fields.
  const target = process.env.API_PROXY_TARGET;
  const base =
    process.env.NEXT_PUBLIC_API_MOCKING === "disabled" && target
      ? `${target}/api`
      : undefined;
  const options = { headers: await sessionHeaders(), base };
  switch (method) {
    case "post":
      return api.post<T>(path, body, options);
    case "put":
      return api.put<T>(path, body, options);
    case "patch":
      return api.patch<T>(path, body, options);
    case "delete":
      return api.delete<T>(path, options);
  }
}

async function run<T>(fn: () => Promise<T>, paths: string[]): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    for (const p of paths) revalidatePath(p, "layout");
    return { ok: true, data };
  } catch (err) {
    return failure(err);
  }
}

const logAudit = (
  actionType: AuditActionType,
  targetRef: string,
  opts: {
    mode?: "view-as" | "act-as" | null;
    clinicId?: number | null;
    fieldSet?: string | null;
    detail?: Record<string, unknown> | null;
  } = {},
) => {
  const target = process.env.API_PROXY_TARGET;
  const base =
    process.env.NEXT_PUBLIC_API_MOCKING === "disabled" && target
      ? `${target}/api`
      : undefined;
  return sessionHeaders().then((headers) =>
    auditApi
      .createAuditLog(
        {
          action_type: actionType,
          target_ref: targetRef,
          clinic_id: opts.clinicId ?? null,
          mode: opts.mode ?? null,
          field_set: opts.fieldSet ?? null,
          detail: opts.detail ?? null,
        },
        { headers, base },
      )
      .catch(() => undefined),
  );
};

// --- clinics --------------------------------------------------------------------

export async function createClinicAction(body: ClinicCreate) {
  return run(async () => {
    const clinic = await clinicMutation<ClinicOut>("post", "/admin/clinics", body);
    await logAudit("account_creation", clinic.clinic_code, { clinicId: clinic.id });
    return clinic;
  }, ["/"]);
}

export async function updateClinicAction(clinicId: number, body: ClinicUpdate) {
  return run(
    () => clinicMutation<ClinicOut>("put", `/admin/clinics/${clinicId}`, body),
    ["/"],
  );
}

export async function setClinicStatusAction(clinicId: number, status: number, code: string) {
  return run(async () => {
    const out = await clinicMutation<ClinicOut>("patch", `/admin/clinics/${clinicId}/status`, { status });
    await logAudit("batch_operation", `${code} · status → ${status}`, { clinicId });
    return out;
  }, ["/"]);
}

export async function setClinicFlagAction(clinicId: number, isFlagged: boolean, code: string) {
  return run(async () => {
    const out = await clinicMutation<ClinicOut>("patch", `/admin/clinics/${clinicId}/flag`, {
      is_flagged: isFlagged ? 1 : 0,
    });
    await logAudit("batch_operation", `${code} · flag → ${isFlagged ? 1 : 0}`, { clinicId });
    return out;
  }, ["/"]);
}

export async function deleteClinicAction(clinicId: number, code: string) {
  return run(async () => {
    await clinicMutation<void>("delete", `/admin/clinics/${clinicId}`);
    await logAudit("batch_operation", `${code} · deleted`, { clinicId: null });
  }, ["/"]);
}

export async function setClinicInsurersAction(clinicId: number, companyIds: number[]) {
  return run(
    () => clinicMutation<number[]>("put", `/admin/clinics/${clinicId}/insurance-companies`, { company_ids: companyIds }),
    ["/"],
  );
}

export async function setClinicCompanyEnablementAction(
  clinicId: number,
  companyId: number,
  enabled: boolean,
) {
  return run(
    () =>
      clinicMutation<{ company_id: number; enabled: boolean }>(
        "patch",
        `/admin/clinics/${clinicId}/insurance-companies/${companyId}`,
        { enabled },
      ),
    ["/"],
  );
}

export async function setClinicTemplateEnablementAction(
  clinicId: number,
  templateId: number,
  enabled: boolean,
) {
  return run(
    () =>
      clinicMutation<{ template_id: number; enabled: boolean }>(
        "patch",
        `/admin/clinics/${clinicId}/templates/${templateId}`,
        { enabled },
      ),
    ["/"],
  );
}

export async function setClinicCompanyTemplatesAction(
  clinicId: number,
  companyId: number,
  templateIds: number[],
) {
  return run(
    () =>
      clinicMutation<{ enabled_template_ids: number[] }>(
        "put",
        `/admin/clinics/${clinicId}/insurance-companies/${companyId}/templates`,
        { template_ids: templateIds },
      ),
    ["/"],
  );
}

export async function updateClinicOpsAction(clinicId: number, code: string, patch: Partial<ClinicOps>) {
  return run(async () => {
    updateClinicOps(clinicId, patch);
    if (patch.retention_months) await logAudit("retention_override", code, { clinicId });
  }, ["/"]);
}

export async function updateClinicSubscriptionAction(
  clinicId: number,
  code: string,
  patch: ClinicSubscriptionUpdate,
) {
  return run(async () => {
    const out = await clinicMutation<ClinicSubscriptionOut>(
      "put",
      `/admin/clinics/${clinicId}/subscription`,
      patch,
    );
    // Keep list-level ops badges roughly in sync until the list reads live subscription.
    const opsPatch: Partial<ClinicOps> = {};
    if (patch.subscription_status) {
      opsPatch.subscription = patch.subscription_status as ClinicOps["subscription"];
    }
    if (patch.plan_code) {
      opsPatch.plan = patch.plan_code as ClinicOps["plan"];
    }
    if (patch.price != null) {
      opsPatch.price_hkd_month = Number(patch.price);
    }
    if (patch.payment_status) {
      opsPatch.payment = patch.payment_status as ClinicOps["payment"];
    }
    if (patch.payment_method) {
      const methodMap: Record<string, ClinicOps["pay_method"]> = {
        bank_transfer: "bank-transfer",
        credit_card: "credit-card",
        cheque: "cheque",
        other: "other",
      };
      opsPatch.pay_method = methodMap[patch.payment_method] ?? "other";
    }
    if (Object.keys(opsPatch).length) updateClinicOps(clinicId, opsPatch);
    return out;
  }, ["/"]);
}

export async function updateClinicSubscriptionNoteAction(
  clinicId: number,
  code: string,
  noteContent: string,
  noteFormat: "markdown" | "html",
) {
  return run(async () => {
    const out = await clinicMutation<ClinicSubscriptionOut>(
      "patch",
      `/admin/clinics/${clinicId}/subscription/note`,
      { note_content: noteContent, note_format: noteFormat },
    );
    return out;
  }, ["/"]);
}

export async function overrideClinicRetentionAction(
  clinicId: number,
  code: string,
  clinicCodeInput: string,
  retentionDays: number,
) {
  return run(async () => {
    const out = await clinicMutation<ClinicRetentionOut>(
      "post",
      `/admin/clinics/${clinicId}/retention/override`,
      { clinic_code_input: clinicCodeInput, retention_days: retentionDays },
    );
    return out;
  }, ["/"]);
}

/** @deprecated Prefer updateClinicSubscriptionNoteAction — clinic notes live on subscription. */
export async function updateClinicNotesAction(clinicId: number, code: string, notes: string) {
  return updateClinicSubscriptionNoteAction(clinicId, code, notes, "markdown");
}

export async function bulkClinicsAction(
  op: "retag" | "deactivate" | "export",
  items: { id: number; code: string }[],
) {
  return run(async () => {
    if (op === "deactivate") {
      for (const item of items) {
        await clinicMutation<ClinicOut>("patch", `/admin/clinics/${item.id}/status`, { status: 0 });
      }
    }
    await logAudit(op === "export" ? "export" : "batch_operation", `clinics · ${op} ×${items.length}`);
  }, ["/"]);
}

// --- doctors --------------------------------------------------------------------

export async function createDoctorAction(body: DoctorCreate) {
  return run(async () => {
    const doctor = await doctors.createDoctor(body);
    await logAudit("account_creation", doctor.login_account);
    return doctor;
  }, ["/"]);
}

export async function updateDoctorAction(doctorId: number, body: DoctorUpdate) {
  return run(async () => {
    const doctor = await doctors.updateDoctor(doctorId, body);
    await logAudit("crm_billing_edit", `${doctor.login_account} · email`);
    return doctor;
  }, ["/"]);
}

export async function updateDoctorOpsAction(doctorId: number, patch: Partial<DoctorOps>) {
  return run(async () => {
    updateDoctorOps(doctorId, patch);
  }, ["/"]);
}

// --- doctor account model (dev ADR 0041) -----------------------------------------

export async function linkDoctorClinicAction(doctorId: number, login: string, clinicId: number) {
  return run(async () => {
    const out = await clinicMutation<DoctorAccountOut>(
      "post",
      `/admin/doctors/${doctorId}/clinics`,
      { clinic_id: clinicId },
    );
    await logAudit("proxy_edit", `${login} · clinic ${clinicId} linked`, { clinicId });
    return out;
  }, ["/"]);
}

export async function unlinkDoctorClinicAction(doctorId: number, login: string, clinicId: number) {
  return run(async () => {
    const out = await clinicMutation<DoctorAccountOut>(
      "delete",
      `/admin/doctors/${doctorId}/clinics/${clinicId}`,
    );
    await logAudit("proxy_edit", `${login} · clinic ${clinicId} unlinked`, { clinicId });
    return out;
  }, ["/"]);
}

export async function setDoctorPrimaryClinicAction(doctorId: number, login: string, clinicId: number) {
  return run(async () => {
    await clinicMutation<void>(
      "put",
      `/admin/doctors/${doctorId}/clinic-links/${clinicId}/set-primary`,
    );
    await logAudit("proxy_edit", `${login} · primary clinic → ${clinicId}`, { clinicId });
  }, ["/"]);
}

export async function updateDoctorAccountAction(
  doctorId: number,
  login: string,
  patch: Partial<Pick<DoctorAccountExtension, "workspace_separation" | "mfa_enabled">>,
) {
  return run(async () => {
    const out = await clinicMutation<DoctorAccountOut>(
      "patch",
      `/admin/doctors/${doctorId}/account-model`,
      patch,
    );
    await logAudit(
      "crm_billing_edit",
      patch.mfa_enabled === undefined
        ? `${login} · account model`
        : `${login} · MFA ${patch.mfa_enabled ? "on" : "off"}`,
    );
    return out;
  }, ["/"]);
}

export async function updateDoctorNotesAction(
  doctorId: number,
  login: string,
  noteContent: string,
  noteFormat: "markdown" | "html",
) {
  return run(async () => {
    const out = await clinicMutation<import("@acuity/types").DoctorOut>(
      "put",
      `/admin/doctors/${doctorId}/account-notes`,
      { notes: noteContent, notes_format: noteFormat },
    );
    await logAudit("crm_billing_edit", `${login} · notes`);
    return out;
  }, ["/"]);
}

export async function updateDoctorSpecialtyAction(
  doctorId: number,
  login: string,
  specialtyTagId: number,
) {
  return run(async () => {
    const out = await doctors.updateDoctor(doctorId, { specialty_tag_id: specialtyTagId });
    await logAudit("tag_category_change", `${login} · specialty`);
    return out;
  }, ["/"]);
}

export async function unlockDoctorAccountAction(doctorId: number, login: string) {
  return run(async () => {
    const out = await accountManagement.unlockDoctorAccount(doctorId);
    await logAudit("proxy_edit", `${login} · unlock`);
    return out;
  }, ["/"]);
}

export async function resendInviteAction(doctorId: number, login: string) {
  return run(async () => {
    const out = await doctors.resetDoctorPassword(doctorId);
    await logAudit("proxy_edit", `${login} · invite resent`);
    return out;
  }, ["/"]);
}

export async function resetDoctorPasswordAction(doctorId: number) {
  return run(() => doctors.resetDoctorPassword(doctorId), ["/"]);
}

// Non-destructive enable/disable (dev ADR 0041) — the account row, links,
// notes, and history all survive a disable.
export async function setDoctorEnabledAction(doctorId: number, login: string, enabled: boolean) {
  return run(async () => {
    const out = await doctors.setDoctorStatus(doctorId, { status: enabled ? 1 : 0 });
    await logAudit("proxy_edit", `${login} · ${enabled ? "enabled" : "disabled"}`);
    return out;
  }, ["/"]);
}

export async function bulkDoctorsAction(
  op: "retag" | "deactivate" | "delete",
  items: { id: number; login: string }[],
) {
  return run(async () => {
    if (op === "deactivate") {
      for (const item of items) await doctors.setDoctorStatus(item.id, { status: 0 });
    }
    if (op === "delete") {
      for (const item of items) {
        await clinicMutation<void>("delete", `/admin/doctors/${item.id}`);
      }
    }
    await logAudit("batch_operation", `doctors · ${op} ×${items.length}`);
  }, ["/"]);
}

// --- forms / templates ------------------------------------------------------------

async function liveRequestOptions() {
  const target = process.env.API_PROXY_TARGET;
  const base =
    process.env.NEXT_PUBLIC_API_MOCKING === "disabled" && target
      ? `${target.replace(/\/$/, "")}/api`
      : undefined;
  return { headers: await sessionHeaders(), base };
}

export async function uploadTemplateAction(formData: FormData) {
  return run(async () => {
    const file = formData.get("file");
    const companyId = Number(formData.get("company_id"));
    const name = String(formData.get("template_name") ?? "");
    if (!(file instanceof Blob) || !Number.isFinite(companyId) || companyId <= 0 || !name) {
      throw new ApiError({ kind: "validation", status: 422, message: "missing upload fields" });
    }

    // Multipart POST /api/admin/templates — same contract as the legacy
    // template admin. Forward the session cookie and hit FastAPI directly in
    // live mode (mirrors clinicMutation); otherwise the Server Action would
    // call without auth and the upload never lands.
    const form = new FormData();
    form.append("company_id", String(companyId));
    form.append("template_name", name);
    form.append("file", file, file instanceof File ? file.name : "template.pdf");

    return api.postForm<{ id: number; parse_status: string }>(
      "/admin/templates",
      form,
      await liveRequestOptions(),
    );
  }, ["/"]);
}

export async function reparseTemplateAction(templateId: number) {
  return run(async () => {
    return api.post<{ id: number; parse_status: string }>(
      `/admin/templates/${templateId}/reparse`,
      undefined,
      await liveRequestOptions(),
    );
  }, ["/"]);
}

export async function createTemplateFieldAction(
  templateId: number,
  body: TemplateFieldCreate,
): Promise<ActionResult<TemplateFieldOut>> {
  return run(async () => {
    return api.post<TemplateFieldOut>(
      `/admin/templates/${templateId}/fields`,
      body,
      await liveRequestOptions(),
    );
  }, []);
}

export async function deleteTemplateFieldAction(templateId: number, fieldId: number) {
  return run(async () => {
    await api.delete<void>(`/admin/templates/${templateId}/fields/${fieldId}`, await liveRequestOptions());
  }, []);
}

export async function updateTemplateFieldAction(
  templateId: number,
  fieldId: number,
  body: TemplateFieldUpdate,
): Promise<ActionResult<TemplateFieldOut>> {
  return run(async () => {
    return api.put<TemplateFieldOut>(
      `/admin/templates/${templateId}/fields/${fieldId}`,
      body,
      await liveRequestOptions(),
    );
  }, []);
}

export async function saveFieldMappingAction(templateId: number, fieldId: number, body: FieldMappingSave) {
  return run(async () => {
    return api.post(
      `/admin/templates/${templateId}/fields/${fieldId}/mapping`,
      body,
      await liveRequestOptions(),
    );
  }, []);
}

export async function ignoreFieldAction(templateId: number, fieldId: number, rowVersion: number, reason?: string) {
  return run(async () => {
    return api.patch<TemplateFieldOut>(
      `/admin/templates/${templateId}/fields/${fieldId}/ignore`,
      { row_version: rowVersion, reason },
      await liveRequestOptions(),
    );
  }, []);
}

export async function restoreFieldAction(templateId: number, fieldId: number, rowVersion: number) {
  return run(async () => {
    return api.patch<TemplateFieldOut>(
      `/admin/templates/${templateId}/fields/${fieldId}/restore`,
      { row_version: rowVersion },
      await liveRequestOptions(),
    );
  }, []);
}

export async function refreshTemplateFieldsAction(templateId: number): Promise<ActionResult<TemplateFieldOut[]>> {
  return run(async () => {
    return api.get<TemplateFieldOut[]>(
      `/admin/templates/${templateId}/fields`,
      await liveRequestOptions(),
    );
  }, []);
}

export async function publishTemplateAction(templateId: number) {
  // The mock handler records the template-publish audit event itself.
  return run(async () => {
    return api.post(`/admin/templates/${templateId}/publish`, undefined, await liveRequestOptions());
  }, ["/"]);
}

export async function archiveTemplateAction(templateId: number, code: string) {
  return run(async () => {
    await api.delete<void>(`/admin/templates/${templateId}`, await liveRequestOptions());
    await logAudit("template_archive", code);
  }, ["/"]);
}

export async function previewFillAction(templateId: number) {
  return run(() => templates.previewFill(templateId, { sample_values: {} }), []);
}

export async function bulkTemplatesAction(
  op: "retag" | "archive" | "delete",
  items: { id: number; code: string }[],
) {
  return run(async () => {
    if (op === "archive" || op === "delete") {
      for (const item of items) {
        await api.delete<void>(`/admin/templates/${item.id}`, await liveRequestOptions());
        if (op === "archive") await logAudit("template_archive", item.code);
      }
    }
    await logAudit("batch_operation", `templates · ${op} ×${items.length}`);
  }, ["/"]);
}

// --- tickets --------------------------------------------------------------------

export async function updateTicketAction(
  ticketId: string,
  body: { status?: "open" | "in-progress" | "resolved"; owner?: string | null; add_note?: string },
) {
  return run(() => adminTickets.updateTicket(ticketId, body), ["/"]);
}

export async function resolveTicketAction(ticketId: string, note?: string) {
  return run(() => adminTickets.resolveTicket(ticketId, note), ["/"]);
}

// --- tags -----------------------------------------------------------------------

export async function createTagAction(kind: "type" | "insurer" | "specialty", labelEn: string, labelZh: string) {
  return run(async () => {
    const tag = await clinicMutation<Tag>("post", "/admin/tags", {
      kind,
      label_en: labelEn,
      label_zh: labelZh,
    });
    await logAudit("tag_category_change", `tag · ${labelEn} added`);
    return tag;
  }, ["/"]);
}

export async function retireTagAction(tagId: number, label: string) {
  return run(async () => {
    const result = await clinicMutation<TagRetireResult>(
      "post",
      `/admin/tags/${tagId}/retire`,
      {},
    );
    await logAudit("tag_category_change", `tag · ${label} retired · re-mapped ${result.remapped_count}`);
    return result;
  }, ["/"]);
}

export async function setTagVisibilityAction(
  entries: { doctor_id: number; tag_id: number; visible: boolean }[],
) {
  return run(
    () =>
      clinicMutation<{ success: boolean }>("put", "/admin/tags/visibility", { entries }),
    ["/"],
  );
}

// --- saved views ------------------------------------------------------------------

export async function createSavedViewAction(grid: string, name: string, filters: Record<string, string>) {
  return run(() => adminSavedViews.createSavedView({ grid, name, filters }), ["/"]);
}

// --- analytics ----------------------------------------------------------------------

export async function exportAnalyticsAction(report: "usage" | "funnel" | "verification" | "quality") {
  // The mock handler records the surrogate-only export audit event.
  return run(() => adminAnalytics.exportAnalytics({ report }), ["/"]);
}

// --- audit / PHI ---------------------------------------------------------------------

export async function revealClaimPhiAction(submissionNo: string) {
  return run(async () => {
    await logAudit("patient_data_view", submissionNo, { fieldSet: "claim.surrogate", detail: { submission_no: submissionNo } });
  }, ["/"]);
}

export async function exportAuditAction(scope: string) {
  return run(async () => {
    await logAudit("export", `audit · ${scope}`);
  }, ["/"]);
}

// --- impersonation ---------------------------------------------------------------------

export async function startImpersonationAction(clinicId: number, doctorId: number, mode: "view-as" | "act-as") {
  // The mock handler persists the session server-side and records the
  // impersonation-start audit event; the banner is server-rendered from it.
  return run(() => adminImpersonation.startImpersonation({ clinic_id: clinicId, doctor_id: doctorId, mode }), ["/"]);
}

export async function endImpersonationAction() {
  return run(() => adminImpersonation.endImpersonation(), ["/"]);
}

// --- insurers / standard fields ----------------------------------------------------------

export async function createCompanyAction(body: CompanyCreate) {
  return run(() => companies.createCompany(body), ["/"]);
}

export async function updateCompanyAction(companyId: number, body: CompanyUpdate) {
  return run(
    () => clinicMutation<import("@acuity/types").CompanyOut>("put", `/admin/insurance-companies/${companyId}`, body),
    ["/", "/insurers", `/insurers/${companyId}`],
  );
}

export async function setCompanyStatusAction(companyId: number, status: number) {
  return run(
    () =>
      clinicMutation<import("@acuity/types").CompanyOut>(
        "patch",
        `/admin/insurance-companies/${companyId}/status`,
        { status },
      ),
    ["/", "/insurers", `/insurers/${companyId}`],
  );
}

export async function deleteCompanyAction(companyId: number, code: string) {
  return run(async () => {
    await clinicMutation<void>("delete", `/admin/insurance-companies/${companyId}`);
    await logAudit("batch_operation", `${code} · deleted`);
  }, ["/", "/insurers"]);
}

export async function createStandardFieldAction(body: StandardFieldCreate) {
  return run(() => fields.createStandardField(body), ["/"]);
}

// --- preferences ------------------------------------------------------------------------

export async function updateProfileAction(patch: { name?: string; email?: string }) {
  return run(async () => {
    updateOperatorProfile(patch);
  }, ["/"]);
}

export async function changeRoleAction(email: string) {
  return run(async () => {
    await logAudit("crm_billing_edit", `rbac · ${email} role change`);
  }, ["/"]);
}
