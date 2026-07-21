"use server";

// Console server actions — every state-transitioning write goes through the
// typed contract endpoints server-side (overview.md: writes use Server
// Actions), so the mock backend (node-side MSW) and a real backend are the
// same seam. Each action returns a typed outcome the client surfaces as a
// toast / inline state; consequential actions also record their audit event
// where the mock handler does not already do so.

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { api, ApiError, clinics, companies, doctors, fields, frontendOnly, templates } from "@acuity/api-client";
import type { DoctorAccountExtension } from "@acuity/api-client";
import type {
  ClinicCreate,
  ClinicOut,
  ClinicUpdate,
  CompanyCreate,
  CompanyUpdate,
  DoctorAccountOut,
  DoctorCreate,
  FieldMappingSave,
  StandardFieldCreate,
  TemplateFieldOut,
  TemplateFieldUpdate,
} from "@acuity/types";
import {
  enrolMfaDevice,
  removeMfaDevice,
  updateClinicOps,
  updateDoctorOps,
  updateOperatorProfile,
  type ClinicOps,
  type DoctorOps,
} from "./ops-model";

const {
  accountManagement,
  adminAudit,
  adminImpersonation,
  adminSavedViews,
  adminTags,
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

const audit = (action: string, target: string, mode: "view-as" | "act-as" | null = null) =>
  adminAudit.recordAuditEvent({ action, target, mode }).catch(() => undefined);

// --- clinics --------------------------------------------------------------------

export async function createClinicAction(body: ClinicCreate) {
  return run(async () => {
    const clinic = await clinicMutation<ClinicOut>("post", "/admin/clinics", body);
    await audit("account-created", clinic.clinic_code);
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
    await audit("bulk-operation", `${code} · status → ${status}`);
    return out;
  }, ["/"]);
}

export async function deleteClinicAction(clinicId: number, code: string) {
  return run(async () => {
    await clinicMutation<void>("delete", `/admin/clinics/${clinicId}`);
    await audit("bulk-operation", `${code} · deleted`);
  }, ["/"]);
}

export async function setClinicInsurersAction(clinicId: number, companyIds: number[]) {
  return run(
    () => clinicMutation<number[]>("put", `/admin/clinics/${clinicId}/insurance-companies`, { company_ids: companyIds }),
    ["/"],
  );
}

export async function updateClinicOpsAction(clinicId: number, code: string, patch: Partial<ClinicOps>) {
  return run(async () => {
    updateClinicOps(clinicId, patch);
    if (patch.subscription || patch.payment || patch.plan || patch.pay_method || patch.price_hkd_month) {
      await audit("crm-edit", code);
    }
    if (patch.retention_months) await audit("retention-override", code);
  }, ["/"]);
}

export async function updateClinicNotesAction(clinicId: number, code: string, notes: string) {
  return run(async () => {
    const out = await accountManagement.updateClinicNotes(clinicId, notes);
    await audit("crm-edit", `${code} · notes`);
    return out;
  }, ["/"]);
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
    await audit(op === "export" ? "export" : "bulk-operation", `clinics · ${op} ×${items.length}`);
  }, ["/"]);
}

// --- doctors --------------------------------------------------------------------

export async function createDoctorAction(body: DoctorCreate) {
  return run(async () => {
    const doctor = await doctors.createDoctor(body);
    await audit("account-created", doctor.login_account);
    return doctor;
  }, ["/"]);
}

export async function updateDoctorOpsAction(doctorId: number, patch: Partial<DoctorOps>) {
  return run(async () => {
    updateDoctorOps(doctorId, patch);
  }, ["/"]);
}

export async function triggerMfaAction(doctorId: number, login: string) {
  return run(async () => {
    updateDoctorOps(doctorId, { mfa: "mfa-pending" });
    await audit("account-created", `${login} · MFA enrolment triggered`);
  }, ["/"]);
}

export async function resetMfaAction(doctorId: number, login: string) {
  return run(async () => {
    await accountManagement.resetDoctorMfa(doctorId);
    updateDoctorOps(doctorId, { mfa: "mfa-pending" });
    await audit("bulk-operation", `${login} · MFA reset`);
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
    await audit("account-link", `${login} · clinic ${clinicId} linked`);
    return out;
  }, ["/"]);
}

export async function unlinkDoctorClinicAction(doctorId: number, login: string, clinicId: number) {
  return run(async () => {
    const out = await clinicMutation<DoctorAccountOut>(
      "delete",
      `/admin/doctors/${doctorId}/clinics/${clinicId}`,
    );
    await audit("account-unlink", `${login} · clinic ${clinicId} unlinked`);
    return out;
  }, ["/"]);
}

export async function updateDoctorAccountAction(
  doctorId: number,
  login: string,
  patch: Partial<Pick<DoctorAccountExtension, "notes" | "workspace_separation" | "mfa_enabled">>,
) {
  return run(async () => {
    const out = await accountManagement.updateDoctorAccountModel(doctorId, patch);
    await audit("crm-edit", `${login} · account model`);
    return out;
  }, ["/"]);
}

export async function unlockDoctorAccountAction(doctorId: number, login: string) {
  return run(async () => {
    const out = await accountManagement.unlockDoctorAccount(doctorId);
    await audit("account-unlock", login);
    return out;
  }, ["/"]);
}

export async function resendInviteAction(doctorId: number, login: string) {
  return run(async () => {
    const out = await doctors.resetDoctorPassword(doctorId);
    await audit("invite-resent", login);
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
    await audit("account-status", `${login} · ${enabled ? "enabled" : "disabled"}`);
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
    await audit("bulk-operation", `doctors · ${op} ×${items.length}`);
  }, ["/"]);
}

// --- forms / templates ------------------------------------------------------------

export async function uploadTemplateAction(formData: FormData) {
  return run(async () => {
    const file = formData.get("file");
    const companyId = Number(formData.get("company_id"));
    const name = String(formData.get("template_name") ?? "");
    if (!(file instanceof Blob) || !companyId || !name) {
      throw new ApiError({ kind: "validation", status: 422, message: "missing upload fields" });
    }
    return templates.createTemplate({
      company_id: companyId,
      template_name: name,
      file,
      filename: file instanceof File ? file.name : "template.pdf",
    });
  }, ["/"]);
}

export async function reparseTemplateAction(templateId: number) {
  return run(() => templates.reparseTemplate(templateId), ["/"]);
}

export async function updateTemplateFieldAction(
  templateId: number,
  fieldId: number,
  body: TemplateFieldUpdate,
): Promise<ActionResult<TemplateFieldOut>> {
  return run(() => templates.updateTemplateField(templateId, fieldId, body), []);
}

export async function saveFieldMappingAction(templateId: number, fieldId: number, body: FieldMappingSave) {
  return run(() => templates.saveFieldMapping(templateId, fieldId, body), []);
}

export async function ignoreFieldAction(templateId: number, fieldId: number, rowVersion: number, reason?: string) {
  return run(() => templates.ignoreTemplateField(templateId, fieldId, { row_version: rowVersion, reason }), []);
}

export async function restoreFieldAction(templateId: number, fieldId: number, rowVersion: number) {
  return run(() => templates.restoreTemplateField(templateId, fieldId, { row_version: rowVersion }), []);
}

export async function refreshTemplateFieldsAction(templateId: number): Promise<ActionResult<TemplateFieldOut[]>> {
  return run(() => templates.listTemplateFields(templateId), []);
}

export async function publishTemplateAction(templateId: number) {
  // The mock handler records the template-publish audit event itself.
  return run(() => templates.publishTemplate(templateId), ["/"]);
}

export async function archiveTemplateAction(templateId: number, code: string) {
  return run(async () => {
    await templates.deleteTemplate(templateId);
    await audit("template-archive", code);
  }, ["/"]);
}

export async function previewFillAction(templateId: number) {
  return run(() => templates.previewFill(templateId, { sample_values: {} }), []);
}

export async function bulkTemplatesAction(
  op: "retag" | "archive",
  items: { id: number; code: string }[],
) {
  return run(async () => {
    if (op === "archive") {
      for (const item of items) {
        await templates.deleteTemplate(item.id);
        await audit("template-archive", item.code);
      }
    }
    await audit("bulk-operation", `templates · ${op} ×${items.length}`);
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
    const tag = await adminTags.createTag({ kind, label_en: labelEn, label_zh: labelZh });
    await audit("tag-change", `tag · ${labelEn} added`);
    return tag;
  }, ["/"]);
}

export async function retireTagAction(tagId: number, label: string) {
  return run(async () => {
    const result = await adminTags.retireTag(tagId, {});
    await audit("tag-change", `tag · ${label} retired · re-mapped ${result.remapped_count}`);
    return result;
  }, ["/"]);
}

export async function setTagVisibilityAction(
  entries: { doctor_id: number; tag_id: number; visible: boolean }[],
) {
  return run(() => adminTags.setTagVisibility(entries), ["/"]);
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
    await audit("phi-reveal", submissionNo);
  }, ["/"]);
}

export async function exportAuditAction(scope: string) {
  return run(async () => {
    await audit("export", `audit · ${scope}`);
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

export async function createStandardFieldAction(body: StandardFieldCreate) {
  return run(() => fields.createStandardField(body), ["/"]);
}

// --- preferences ------------------------------------------------------------------------

export async function updateProfileAction(patch: { name?: string; email?: string }) {
  return run(async () => {
    updateOperatorProfile(patch);
  }, ["/"]);
}

export async function enrolMfaDeviceAction(label: string) {
  return run(async () => {
    enrolMfaDevice(label);
  }, ["/"]);
}

export async function removeMfaDeviceAction(id: string, label: string) {
  return run(async () => {
    removeMfaDevice(id);
    await audit("bulk-operation", `mfa-device · ${label} removed`);
  }, ["/"]);
}

export async function changeRoleAction(email: string) {
  return run(async () => {
    await audit("crm-edit", `rbac · ${email} role change`);
  }, ["/"]);
}
