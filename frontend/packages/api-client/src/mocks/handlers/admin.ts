// Admin-surface handlers — the full /api/admin/* contract (52 operations)
// implemented statefully over the admin store (CRUD, enablement toggles,
// template parse simulation, row_version optimistic lock on template fields),
// plus the FRONTEND-ONLY admin modules (audit events, tickets + onboarding
// queue, tags + visibility, analytics, saved views, impersonation, PHI-redacted
// claims oversight). Tenant/entity misses return 404 with the error envelope.

import { HttpResponse, http } from "msw";
import type {
  ClinicCreate,
  ClinicInsuranceUpdate,
  ClinicOut,
  ClinicStatusUpdate,
  ClinicSubscriptionNoteUpdate,
  ClinicSubscriptionUpdate,
  ClinicTemplatesSet,
  ClinicUpdate,
  CompanyCreate,
  CompanyEnableUpdate,
  CompanyOut,
  CompanyStatusUpdate,
  CompanyUpdate,
  DoctorCreate,
  DoctorOut,
  DoctorStatusUpdate,
  DoctorUpdate,
  DomainCreate,
  DomainOut,
  FieldIgnoreSave,
  FieldMappingSave,
  FieldRestoreSave,
  StandardFieldCreate,
  StandardFieldOut,
  StandardFieldUpdate,
  TemplateEnableUpdate,
  TemplateFieldCreate,
  TemplateFieldOut,
  TemplateFieldUpdate,
  TemplateOut,
  TemplateUpdate,
  TransformRuleCreate,
  TransformRuleOut,
} from "@acuity/types";
import type { AuditEventCreate } from "../../endpoints/frontend-only/admin-audit";
import type { ImpersonationSession, ImpersonationStartRequest } from "../../endpoints/frontend-only/admin-impersonation";
import type { SavedView, SavedViewCreate, SavedViewUpdate } from "../../endpoints/frontend-only/admin-saved-views";
import type { Tag, TagCreate, TagRetireRequest, TagUpdate, TagVisibilityEntry } from "../../endpoints/frontend-only/admin-tags";
import type { TicketUpdate } from "../../endpoints/frontend-only/admin-tickets";
import {
  analyticsErrors,
  analyticsFunnel,
  analyticsOverview,
  analyticsQuality,
  analyticsUsage,
  analyticsVerification,
} from "../fixtures/index";
import { adminState, defaultClinicSubscription, nextAdminId } from "../stores/admin-store";
import { listClaimEntries } from "../stores/claims-store";
import {
  frontendOnlyState,
  nextFrontendOnlyId,
  recordAuditEvent,
} from "../stores/frontend-only-store";
import { isConflict, isTenantNotFound, listItems } from "../scenario";
import { API, conflictZh, errorEnvelope, gate, notFoundZh, page, pageQuery } from "./shared";

function keyword(request: Request): string {
  return (new URL(request.url).searchParams.get("keyword") ?? "").toLowerCase();
}

function matches(k: string, ...values: (string | null | undefined)[]): boolean {
  if (!k) return true;
  return values.some((v) => (v ?? "").toLowerCase().includes(k));
}

function clinicNameConflict(
  clinics: ClinicOut[],
  name: string,
  excludeId?: number,
): boolean {
  const normalized = name.trim().toLowerCase();
  if (!normalized) return false;
  return clinics.some(
    (c) => c.id !== excludeId && c.clinic_name.trim().toLowerCase() === normalized,
  );
}

function clinicNameEnConflict(
  clinics: ClinicOut[],
  nameEn: string | null | undefined,
  excludeId?: number,
): boolean {
  const normalized = (nameEn ?? "").trim().toLowerCase();
  if (!normalized) return false;
  return clinics.some(
    (c) =>
      c.id !== excludeId &&
      (c.clinic_name_en ?? "").trim().toLowerCase() === normalized,
  );
}

function sortClinics(rows: ClinicOut[], sortRaw: string | null, doctorCounts: Map<number, number>): ClinicOut[] {
  if (!sortRaw) return rows;
  const desc = sortRaw.startsWith("-");
  const key = desc ? sortRaw.slice(1) : sortRaw;
  const dir = desc ? -1 : 1;
  const accessor = (c: ClinicOut): string | number => {
    switch (key) {
      case "name":
        return (c.clinic_name_en ?? c.clinic_name).toLowerCase();
      case "code":
        return c.clinic_code;
      case "status":
        return c.status;
      case "doctors":
        return doctorCounts.get(c.id) ?? 0;
      case "created_at":
        return c.created_at;
      default:
        return c.id;
    }
  };
  return [...rows].sort((a, b) => {
    const va = accessor(a);
    const vb = accessor(b);
    if (va < vb) return -1 * dir;
    if (va > vb) return 1 * dir;
    return b.id - a.id;
  });
}

const nowIso = () => new Date().toISOString();

// Account-model helpers (dev ADR 0041): clinic_ids is a mock-first body
// extension on DoctorOut; clinic_id stays the primary (first) link for
// contract compatibility.
function doctorClinicIds(doctor: DoctorOut): number[] {
  const ext = doctor as DoctorOut & { clinic_ids?: number[] };
  if (!Array.isArray(ext.clinic_ids)) {
    ext.clinic_ids = doctor.clinic_id ? [doctor.clinic_id] : [];
  }
  return ext.clinic_ids;
}

function setDoctorClinicIds(doctor: DoctorOut, ids: number[]): void {
  // Individual accounts (zero links) carry a null primary clinic — a contract
  // delta the backend picks up with the account model (dev ADR 0041).
  const ext = doctor as Omit<DoctorOut, "clinic_id"> & {
    clinic_ids?: number[];
    clinic_id: number | null;
  };
  ext.clinic_ids = ids;
  ext.clinic_id = ids[0] ?? null;
}

export const adminHandlers = [
  // ===== clinics (contract) ===================================================
  http.get(`${API}/admin/clinics`, async ({ request }) => {
    const { scenario, deny } = await gate(request);
    if (deny) return deny;
    const k = keyword(request);
    const s = adminState();
    let rows = s.clinics.filter((c) =>
      matches(k, c.clinic_name, c.clinic_name_en, c.clinic_code),
    );
    const flagged = new URL(request.url).searchParams.get("is_flagged");
    if (flagged === "0" || flagged === "1") {
      const want = Number(flagged);
      rows = rows.filter((c) => Number(c.is_flagged ?? 0) === want);
    }
    const doctorCounts = new Map<number, number>();
    for (const d of s.doctors) {
      for (const clinicId of doctorClinicIds(d)) {
        doctorCounts.set(clinicId, (doctorCounts.get(clinicId) ?? 0) + 1);
      }
    }
    const sortRaw = new URL(request.url).searchParams.get("sort");
    rows = sortClinics(rows, sortRaw, doctorCounts);
    const { pageNo, pageSize } = pageQuery(request);
    return HttpResponse.json(page(listItems(scenario, rows), pageNo, pageSize));
  }),

  http.post(`${API}/admin/clinics`, async ({ request }) => {
    const { scenario, deny } = await gate(request);
    if (deny) return deny;
    if (isConflict(scenario)) return conflictZh();
    const body = (await request.json()) as ClinicCreate;
    const s = adminState();
    if (clinicNameConflict(s.clinics, body.clinic_name)) {
      return errorEnvelope("CONFLICT", "诊所中文名称已存在", 409);
    }
    const nameEn = body.clinic_name_en?.trim() || null;
    if (clinicNameEnConflict(s.clinics, nameEn)) {
      return errorEnvelope("CONFLICT", "诊所英文名称已存在", 409);
    }
    const id = nextAdminId();
    const districtId = body.district_id ?? null;
    const district = districtId
      ? s.districts.find((d) => d.id === districtId)
      : undefined;
    if (districtId != null && !district) {
      return errorEnvelope("VALIDATION_ERROR", "地区不存在，请从地区字典中选择", 422);
    }
    const clinic: ClinicOut = {
      id,
      clinic_code: body.clinic_code ?? `CL-${String(id).padStart(4, "0")}`,
      clinic_name: body.clinic_name.trim(),
      clinic_name_en: nameEn,
      address: body.address ?? null,
      phone: body.phone ?? null,
      chop_image_url: body.chop_image_url ?? null,
      status: 1,
      idle_lock_minutes: 10,
      data_region: body.data_region ?? "香港",
      is_flagged: 0,
      district_id: districtId,
      district_name_zh: district?.name_zh ?? null,
      district_name_en: district?.name_en ?? null,
      created_at: nowIso(),
      subscription_status: "trial",
      payment_status: null,
      plan_code: null,
    };
    s.clinics.unshift(clinic);
    s.clinicInsurers.set(id, []);
    s.clinicTemplates.set(id, []);
    s.clinicSubscriptions.set(id, defaultClinicSubscription(id));
    return HttpResponse.json(clinic);
  }),

  http.get(`${API}/admin/clinics/:clinicId`, async ({ request, params }) => {
    const { scenario, deny } = await gate(request);
    if (deny) return deny;
    if (isTenantNotFound(scenario)) return notFoundZh("診所不存在");
    const clinic = adminState().clinics.find((c) => c.id === Number(params.clinicId));
    if (!clinic) return notFoundZh("診所不存在");
    return HttpResponse.json(clinic);
  }),

  http.put(`${API}/admin/clinics/:clinicId`, async ({ request, params }) => {
    const { scenario, deny } = await gate(request);
    if (deny) return deny;
    if (isConflict(scenario)) return conflictZh();
    const s = adminState();
    const clinicId = Number(params.clinicId);
    const clinic = s.clinics.find((c) => c.id === clinicId);
    if (!clinic) return notFoundZh("診所不存在");
    const body = (await request.json()) as ClinicUpdate;
    if (body.clinic_name != null) {
      if (clinicNameConflict(s.clinics, body.clinic_name, clinicId)) {
        return errorEnvelope("CONFLICT", "诊所中文名称已存在", 409);
      }
      clinic.clinic_name = body.clinic_name.trim();
    }
    if (body.clinic_name_en !== undefined) {
      const nameEn = body.clinic_name_en?.trim() || null;
      if (clinicNameEnConflict(s.clinics, nameEn, clinicId)) {
        return errorEnvelope("CONFLICT", "诊所英文名称已存在", 409);
      }
      clinic.clinic_name_en = nameEn;
    }
    if (body.address !== undefined) clinic.address = body.address;
    if (body.phone !== undefined) clinic.phone = body.phone;
    if (body.chop_image_url !== undefined) clinic.chop_image_url = body.chop_image_url;
    if (body.idle_lock_minutes !== undefined) clinic.idle_lock_minutes = body.idle_lock_minutes;
    if (body.data_region !== undefined && body.data_region != null) {
      clinic.data_region = body.data_region;
    }
    if (body.district_id !== undefined) {
      if (body.district_id == null) {
        clinic.district_id = null;
        clinic.district_name_zh = null;
        clinic.district_name_en = null;
      } else {
        const district = s.districts.find((d) => d.id === body.district_id);
        if (!district) {
          return errorEnvelope("VALIDATION_ERROR", "地区不存在，请从地区字典中选择", 422);
        }
        clinic.district_id = district.id;
        clinic.district_name_zh = district.name_zh;
        clinic.district_name_en = district.name_en;
      }
    }
    return HttpResponse.json(clinic);
  }),

  // ===== districts ============================================================
  http.get(`${API}/admin/districts`, async ({ request }) => {
    const { scenario, deny } = await gate(request);
    if (deny) return deny;
    const region = new URL(request.url).searchParams.get("region");
    let rows = adminState().districts;
    if (region) rows = rows.filter((d) => d.region === region);
    return HttpResponse.json(listItems(scenario, rows));
  }),

  http.post(`${API}/admin/districts`, async ({ request }) => {
    const { deny } = await gate(request);
    if (deny) return deny;
    const body = (await request.json()) as {
      name_zh: string;
      name_en?: string | null;
      region?: string | null;
    };
    const nameZh = body.name_zh?.trim();
    if (!nameZh) return errorEnvelope("VALIDATION_ERROR", "地区中文名称不能为空", 422);
    const s = adminState();
    if (s.districts.some((d) => d.name_zh === nameZh)) {
      return errorEnvelope("CONFLICT", "地区中文名称已存在", 409);
    }
    const district = {
      id: nextAdminId(),
      name_zh: nameZh,
      name_en: body.name_en?.trim() || null,
      region: body.region?.trim() || null,
    };
    s.districts.push(district);
    return HttpResponse.json(district);
  }),

  http.get(`${API}/admin/districts/:districtId`, async ({ request, params }) => {
    const { deny } = await gate(request);
    if (deny) return deny;
    const district = adminState().districts.find((d) => d.id === Number(params.districtId));
    if (!district) return notFoundZh("地区不存在");
    return HttpResponse.json(district);
  }),

  http.put(`${API}/admin/districts/:districtId`, async ({ request, params }) => {
    const { deny } = await gate(request);
    if (deny) return deny;
    const s = adminState();
    const district = s.districts.find((d) => d.id === Number(params.districtId));
    if (!district) return notFoundZh("地区不存在");
    const body = (await request.json()) as {
      name_zh?: string | null;
      name_en?: string | null;
      region?: string | null;
    };
    if (body.name_zh !== undefined) {
      const nameZh = body.name_zh?.trim() || "";
      if (!nameZh) return errorEnvelope("VALIDATION_ERROR", "地区中文名称不能为空", 422);
      if (s.districts.some((d) => d.id !== district.id && d.name_zh === nameZh)) {
        return errorEnvelope("CONFLICT", "地区中文名称已存在", 409);
      }
      district.name_zh = nameZh;
    }
    if (body.name_en !== undefined) district.name_en = body.name_en?.trim() || null;
    if (body.region !== undefined) district.region = body.region?.trim() || null;
    return HttpResponse.json(district);
  }),

  http.delete(`${API}/admin/districts/:districtId`, async ({ request, params }) => {
    const { deny } = await gate(request);
    if (deny) return deny;
    const s = adminState();
    const districtId = Number(params.districtId);
    if (s.clinics.some((c) => c.district_id === districtId)) {
      return errorEnvelope("CONFLICT", "该地区仍有关联诊所，无法删除", 409);
    }
    const index = s.districts.findIndex((d) => d.id === districtId);
    if (index === -1) return notFoundZh("地区不存在");
    s.districts.splice(index, 1);
    return new HttpResponse(null, { status: 204 });
  }),

  http.delete(`${API}/admin/clinics/:clinicId`, async ({ request, params }) => {
    const { deny } = await gate(request);
    if (deny) return deny;
    const s = adminState();
    const clinicId = Number(params.clinicId);
    const index = s.clinics.findIndex((c) => c.id === clinicId);
    if (index === -1) return notFoundZh("診所不存在");
    s.clinics.splice(index, 1);
    s.clinicInsurers.delete(clinicId);
    s.clinicTemplates.delete(clinicId);
    s.clinicSubscriptions.delete(clinicId);
    return new HttpResponse(null, { status: 204 });
  }),

  http.patch(`${API}/admin/clinics/:clinicId/status`, async ({ request, params }) => {
    const { deny } = await gate(request);
    if (deny) return deny;
    const clinic = adminState().clinics.find((c) => c.id === Number(params.clinicId));
    if (!clinic) return notFoundZh("診所不存在");
    const body = (await request.json()) as ClinicStatusUpdate;
    clinic.status = body.status;
    return HttpResponse.json(clinic);
  }),

  http.patch(`${API}/admin/clinics/:clinicId/flag`, async ({ request, params }) => {
    const { deny } = await gate(request);
    if (deny) return deny;
    const clinic = adminState().clinics.find((c) => c.id === Number(params.clinicId));
    if (!clinic) return notFoundZh("診所不存在");
    const body = (await request.json()) as { is_flagged: number };
    clinic.is_flagged = body.is_flagged ? 1 : 0;
    return HttpResponse.json(clinic);
  }),

  http.get(`${API}/admin/clinics/:clinicId/subscription`, async ({ request, params }) => {
    const { deny } = await gate(request);
    if (deny) return deny;
    const s = adminState();
    const clinicId = Number(params.clinicId);
    if (!s.clinics.some((c) => c.id === clinicId)) return notFoundZh("診所不存在");
    let row = s.clinicSubscriptions.get(clinicId);
    if (!row) {
      row = defaultClinicSubscription(clinicId);
      s.clinicSubscriptions.set(clinicId, row);
    }
    return HttpResponse.json(row);
  }),

  http.put(`${API}/admin/clinics/:clinicId/subscription`, async ({ request, params }) => {
    const { deny } = await gate(request);
    if (deny) return deny;
    const s = adminState();
    const clinicId = Number(params.clinicId);
    if (!s.clinics.some((c) => c.id === clinicId)) return notFoundZh("診所不存在");
    let row = s.clinicSubscriptions.get(clinicId);
    if (!row) {
      row = defaultClinicSubscription(clinicId);
      s.clinicSubscriptions.set(clinicId, row);
    }
    const body = (await request.json()) as ClinicSubscriptionUpdate;
    if (body.subscription_status !== undefined) row.subscription_status = body.subscription_status;
    if (body.plan_code !== undefined) row.plan_code = body.plan_code;
    if (body.price !== undefined) row.price = body.price;
    if (body.currency !== undefined && body.currency != null) row.currency = body.currency;
    if (body.payment_status !== undefined) row.payment_status = body.payment_status;
    if (body.payment_method !== undefined) row.payment_method = body.payment_method;
    row.updated_at = new Date().toISOString();
    return HttpResponse.json(row);
  }),

  http.patch(`${API}/admin/clinics/:clinicId/subscription/note`, async ({ request, params }) => {
    const { deny } = await gate(request);
    if (deny) return deny;
    const s = adminState();
    const clinicId = Number(params.clinicId);
    if (!s.clinics.some((c) => c.id === clinicId)) return notFoundZh("診所不存在");
    let row = s.clinicSubscriptions.get(clinicId);
    if (!row) {
      row = defaultClinicSubscription(clinicId);
      s.clinicSubscriptions.set(clinicId, row);
    }
    const body = (await request.json()) as ClinicSubscriptionNoteUpdate;
    if (body.note_content === undefined && body.note_format === undefined) {
      return errorEnvelope("VALIDATION_ERROR", "备注内容或格式至少提供一项", 422);
    }
    if (body.note_content !== undefined) row.note_content = body.note_content;
    if (body.note_format !== undefined) row.note_format = body.note_format;
    row.note_updated_by = 1;
    row.note_updated_at = new Date().toISOString();
    row.updated_at = row.note_updated_at;
    return HttpResponse.json(row);
  }),

  http.get(`${API}/admin/clinics/:clinicId/insurance-companies`, async ({ request, params }) => {
    const { deny } = await gate(request);
    if (deny) return deny;
    const ids = adminState().clinicInsurers.get(Number(params.clinicId));
    if (!ids) return notFoundZh("診所不存在");
    return HttpResponse.json(ids);
  }),

  http.put(`${API}/admin/clinics/:clinicId/insurance-companies`, async ({ request, params }) => {
    const { scenario, deny } = await gate(request);
    if (deny) return deny;
    if (isConflict(scenario)) return conflictZh();
    const s = adminState();
    if (!s.clinicInsurers.has(Number(params.clinicId))) return notFoundZh("診所不存在");
    const body = (await request.json()) as ClinicInsuranceUpdate;
    s.clinicInsurers.set(Number(params.clinicId), [...body.company_ids]);
    return HttpResponse.json(body.company_ids);
  }),

  http.get(`${API}/admin/clinics/:clinicId/config-overview`, async ({ request, params }) => {
    const { deny } = await gate(request);
    if (deny) return deny;
    const s = adminState();
    const clinicId = Number(params.clinicId);
    if (!s.clinics.some((c) => c.id === clinicId)) return notFoundZh("診所不存在");
    const enabledCompanies = s.clinicInsurers.get(clinicId) ?? [];
    const enabledTemplates = s.clinicTemplates.get(clinicId) ?? [];
    const companies = s.companies.map((company) => {
      const templates = s.templates
        .filter((t) => t.company_id === company.id)
        .map((t) => ({
          template_id: t.id,
          template_name: t.template_name,
          version: t.version,
          parse_status: t.parse_status,
          is_active: t.is_active,
          enabled: enabledTemplates.includes(t.id),
          updated_at: t.created_at,
        }));
      return {
        company_id: company.id,
        company_name: company.company_name,
        enabled: enabledCompanies.includes(company.id),
        template_count: templates.length,
        enabled_template_count: templates.filter((t) => t.enabled).length,
        templates,
      };
    });
    return HttpResponse.json({ companies });
  }),

  http.patch(
    `${API}/admin/clinics/:clinicId/insurance-companies/:companyId`,
    async ({ request, params }) => {
      const { deny } = await gate(request);
      if (deny) return deny;
      const s = adminState();
      const clinicId = Number(params.clinicId);
      const companyId = Number(params.companyId);
      const enabled = s.clinicInsurers.get(clinicId);
      if (!enabled || !s.companies.some((c) => c.id === companyId)) {
        return notFoundZh("診所或保險公司不存在");
      }
      const body = (await request.json()) as CompanyEnableUpdate;
      const next = enabled.filter((id) => id !== companyId);
      if (body.enabled) next.push(companyId);
      s.clinicInsurers.set(clinicId, next);
      return HttpResponse.json({ company_id: companyId, enabled: body.enabled });
    },
  ),

  http.patch(`${API}/admin/clinics/:clinicId/templates/:templateId`, async ({ request, params }) => {
    const { deny } = await gate(request);
    if (deny) return deny;
    const s = adminState();
    const clinicId = Number(params.clinicId);
    const templateId = Number(params.templateId);
    const enabled = s.clinicTemplates.get(clinicId);
    if (!enabled || !s.templates.some((t) => t.id === templateId)) {
      return notFoundZh("診所或範本不存在");
    }
    const body = (await request.json()) as TemplateEnableUpdate;
    const next = enabled.filter((id) => id !== templateId);
    if (body.enabled) next.push(templateId);
    s.clinicTemplates.set(clinicId, next);
    return HttpResponse.json({ template_id: templateId, enabled: body.enabled });
  }),

  http.put(
    `${API}/admin/clinics/:clinicId/insurance-companies/:companyId/templates`,
    async ({ request, params }) => {
      const { deny } = await gate(request);
      if (deny) return deny;
      const s = adminState();
      const clinicId = Number(params.clinicId);
      const companyId = Number(params.companyId);
      const enabled = s.clinicTemplates.get(clinicId);
      if (!enabled || !s.companies.some((c) => c.id === companyId)) {
        return notFoundZh("診所或保險公司不存在");
      }
      const body = (await request.json()) as ClinicTemplatesSet;
      const companyTemplateIds = new Set(
        s.templates.filter((t) => t.company_id === companyId).map((t) => t.id),
      );
      const kept = enabled.filter((id) => !companyTemplateIds.has(id));
      const next = [...kept, ...body.template_ids.filter((id) => companyTemplateIds.has(id))];
      s.clinicTemplates.set(clinicId, next);
      return HttpResponse.json({
        enabled_template_ids: next.filter((id) => companyTemplateIds.has(id)),
      });
    },
  ),

  // ===== doctors (contract) ====================================================
  http.get(`${API}/admin/doctors`, async ({ request }) => {
    const { scenario, deny } = await gate(request);
    if (deny) return deny;
    const url = new URL(request.url);
    const clinicId = url.searchParams.get("clinic_id");
    const linked = url.searchParams.get("linked");
    const k = keyword(request);
    let rows = adminState().doctors;
    // Account model (dev ADR 0041): a doctor links to zero/one/many clinics.
    if (clinicId) {
      rows = rows.filter((d) => doctorClinicIds(d).includes(Number(clinicId)));
    }
    if (linked === "clinic") rows = rows.filter((d) => doctorClinicIds(d).length > 0);
    if (linked === "individual") rows = rows.filter((d) => doctorClinicIds(d).length === 0);
    rows = rows.filter((d) => matches(k, d.doctor_name, d.doctor_name_en, d.login_account, d.email));
    const { pageNo, pageSize } = pageQuery(request);
    return HttpResponse.json(page(listItems(scenario, rows), pageNo, pageSize));
  }),

  http.post(`${API}/admin/doctors`, async ({ request }) => {
    const { deny } = await gate(request);
    if (deny) return deny;
    const body = (await request.json()) as DoctorCreate;
    const doctor: DoctorOut = {
      id: nextAdminId(),
      clinic_id: body.clinic_id,
      doctor_name: body.doctor_name,
      doctor_name_en: body.doctor_name_en ?? null,
      reg_no: body.reg_no ?? null,
      email: body.email ?? null,
      signature_url: body.signature_url ?? null,
      login_account: body.login_account,
      status: 1,
      created_at: nowIso(),
    };
    adminState().doctors.unshift(doctor);
    return HttpResponse.json(doctor);
  }),

  http.get(`${API}/admin/doctors/:doctorId`, async ({ request, params }) => {
    const { scenario, deny } = await gate(request);
    if (deny) return deny;
    if (isTenantNotFound(scenario)) return notFoundZh("醫生不存在");
    const doctor = adminState().doctors.find((d) => d.id === Number(params.doctorId));
    if (!doctor) return notFoundZh("醫生不存在");
    return HttpResponse.json(doctor);
  }),

  http.put(`${API}/admin/doctors/:doctorId`, async ({ request, params }) => {
    const { scenario, deny } = await gate(request);
    if (deny) return deny;
    if (isConflict(scenario)) return conflictZh();
    const doctor = adminState().doctors.find((d) => d.id === Number(params.doctorId));
    if (!doctor) return notFoundZh("醫生不存在");
    const body = (await request.json()) as DoctorUpdate;
    if (body.doctor_name != null) doctor.doctor_name = body.doctor_name;
    if (body.doctor_name_en !== undefined) doctor.doctor_name_en = body.doctor_name_en;
    if (body.reg_no !== undefined) doctor.reg_no = body.reg_no;
    if (body.email !== undefined) doctor.email = body.email;
    if (body.login_account != null) doctor.login_account = body.login_account;
    if (body.signature_url !== undefined) doctor.signature_url = body.signature_url;
    if (body.status != null) doctor.status = body.status;
    return HttpResponse.json(doctor);
  }),

  http.delete(`${API}/admin/doctors/:doctorId`, async ({ request, params }) => {
    const { deny } = await gate(request);
    if (deny) return deny;
    const s = adminState();
    const index = s.doctors.findIndex((d) => d.id === Number(params.doctorId));
    if (index === -1) return notFoundZh("醫生不存在");
    s.doctors.splice(index, 1);
    return new HttpResponse(null, { status: 204 });
  }),

  http.patch(`${API}/admin/doctors/:doctorId/status`, async ({ request, params }) => {
    const { deny } = await gate(request);
    if (deny) return deny;
    const doctor = adminState().doctors.find((d) => d.id === Number(params.doctorId));
    if (!doctor) return notFoundZh("醫生不存在");
    const body = (await request.json()) as DoctorStatusUpdate;
    doctor.status = body.status;
    return HttpResponse.json(doctor);
  }),

  http.post(`${API}/admin/doctors/:doctorId/reset-password`, async ({ request, params }) => {
    const { deny } = await gate(request);
    if (deny) return deny;
    const doctor = adminState().doctors.find((d) => d.id === Number(params.doctorId));
    if (!doctor) return notFoundZh("醫生不存在");
    return HttpResponse.json({ temp_password: `Tmp-${doctor.id}-${Date.now() % 10000}` });
  }),

  // ===== doctors: account model extensions (frontend-only, dev ADR 0041) ======
  http.post(`${API}/admin/doctors/:doctorId/clinics`, async ({ request, params }) => {
    const { deny } = await gate(request);
    if (deny) return deny;
    const doctor = adminState().doctors.find((d) => d.id === Number(params.doctorId));
    if (!doctor) return notFoundZh("醫生不存在");
    const body = (await request.json()) as { clinic_id: number };
    const clinic = adminState().clinics.find((c) => c.id === body.clinic_id);
    if (!clinic) return notFoundZh("診所不存在");
    const ids = doctorClinicIds(doctor);
    if (!ids.includes(body.clinic_id)) ids.push(body.clinic_id);
    setDoctorClinicIds(doctor, ids);
    return HttpResponse.json(doctor);
  }),

  // Atomic replacement of the linked-clinic set (covers switch; ADR 0041
  // decision 2), mirroring the clinic insurance-companies set-collection op.
  http.put(`${API}/admin/doctors/:doctorId/clinics`, async ({ request, params }) => {
    const { deny } = await gate(request);
    if (deny) return deny;
    const doctor = adminState().doctors.find((d) => d.id === Number(params.doctorId));
    if (!doctor) return notFoundZh("醫生不存在");
    const body = (await request.json()) as { clinic_ids: number[] };
    const clinics = adminState().clinics;
    if (!body.clinic_ids.every((id) => clinics.some((c) => c.id === id))) {
      return notFoundZh("診所不存在");
    }
    setDoctorClinicIds(doctor, [...new Set(body.clinic_ids)]);
    return HttpResponse.json(doctor);
  }),

  http.delete(
    `${API}/admin/doctors/:doctorId/clinics/:clinicId`,
    async ({ request, params }) => {
      const { deny } = await gate(request);
      if (deny) return deny;
      const doctor = adminState().doctors.find((d) => d.id === Number(params.doctorId));
      if (!doctor) return notFoundZh("醫生不存在");
      const ids = doctorClinicIds(doctor).filter((id) => id !== Number(params.clinicId));
      setDoctorClinicIds(doctor, ids);
      return HttpResponse.json(doctor);
    },
  ),

  http.patch(
    `${API}/admin/doctors/:doctorId/account-model`,
    async ({ request, params }) => {
      const { deny } = await gate(request);
      if (deny) return deny;
      const doctor = adminState().doctors.find((d) => d.id === Number(params.doctorId));
      if (!doctor) return notFoundZh("醫生不存在");
      const body = (await request.json()) as Partial<{
        notes: string;
        workspace_separation: "separated" | "merged";
        mfa_enabled: boolean;
      }>;
      const ext = doctor as Record<string, unknown>;
      if (body.notes !== undefined) ext.notes = body.notes;
      if (body.workspace_separation !== undefined)
        ext.workspace_separation = body.workspace_separation;
      if (body.mfa_enabled !== undefined) ext.mfa_enabled = body.mfa_enabled;
      return HttpResponse.json(doctor);
    },
  ),

  http.post(`${API}/admin/doctors/:doctorId/reset-mfa`, async ({ request, params }) => {
    const { deny } = await gate(request);
    if (deny) return deny;
    const doctor = adminState().doctors.find((d) => d.id === Number(params.doctorId));
    if (!doctor) return notFoundZh("醫生不存在");
    (doctor as Record<string, unknown>).mfa_enabled = false;
    return HttpResponse.json(doctor);
  }),

  http.post(`${API}/admin/doctors/:doctorId/unlock`, async ({ request, params }) => {
    const { deny } = await gate(request);
    if (deny) return deny;
    const doctor = adminState().doctors.find((d) => d.id === Number(params.doctorId));
    if (!doctor) return notFoundZh("醫生不存在");
    // The mock lock lives on the auth account fixture keyed by login_account.
    return HttpResponse.json(doctor);
  }),

  http.patch(`${API}/admin/clinics/:clinicId/notes`, async ({ request, params }) => {
    const { deny } = await gate(request);
    if (deny) return deny;
    const clinic = adminState().clinics.find((c) => c.id === Number(params.clinicId));
    if (!clinic) return notFoundZh("診所不存在");
    const body = (await request.json()) as { notes: string };
    (clinic as Record<string, unknown>).notes = body.notes;
    return HttpResponse.json(clinic);
  }),

  // ===== insurance companies (contract) ========================================
  http.get(`${API}/admin/insurance-companies`, async ({ request }) => {
    const { scenario, deny } = await gate(request);
    if (deny) return deny;
    const k = keyword(request);
    const rows = adminState().companies.filter((c) =>
      matches(k, c.company_name, c.company_name_en, c.company_code),
    );
    const { pageNo, pageSize } = pageQuery(request);
    return HttpResponse.json(page(listItems(scenario, rows), pageNo, pageSize));
  }),

  http.post(`${API}/admin/insurance-companies`, async ({ request }) => {
    const { deny } = await gate(request);
    if (deny) return deny;
    const body = (await request.json()) as CompanyCreate;
    const id = nextAdminId();
    const company: CompanyOut = {
      id,
      company_code: body.company_code ?? `INS-${String(id).padStart(4, "0")}`,
      company_name: body.company_name,
      company_name_en: body.company_name_en ?? null,
      logo_url: body.logo_url ?? null,
      contact_info: body.contact_info ?? null,
      status: 1,
      created_at: nowIso(),
    };
    adminState().companies.unshift(company);
    return HttpResponse.json(company);
  }),

  // Registered before :companyId so "logo" never matches as an id.
  http.post(`${API}/admin/insurance-companies/logo`, async ({ request }) => {
    const { deny } = await gate(request);
    if (deny) return deny;
    return HttpResponse.json({ url: `/local-storage/logos/upload-${Date.now() % 100000}.png` });
  }),

  http.get(`${API}/admin/insurance-companies/:companyId`, async ({ request, params }) => {
    const { scenario, deny } = await gate(request);
    if (deny) return deny;
    if (isTenantNotFound(scenario)) return notFoundZh("保險公司不存在");
    const company = adminState().companies.find((c) => c.id === Number(params.companyId));
    if (!company) return notFoundZh("保險公司不存在");
    return HttpResponse.json(company);
  }),

  http.put(`${API}/admin/insurance-companies/:companyId`, async ({ request, params }) => {
    const { scenario, deny } = await gate(request);
    if (deny) return deny;
    if (isConflict(scenario)) return conflictZh();
    const company = adminState().companies.find((c) => c.id === Number(params.companyId));
    if (!company) return notFoundZh("保險公司不存在");
    const body = (await request.json()) as CompanyUpdate;
    if (body.company_name != null) company.company_name = body.company_name;
    if (body.company_name_en !== undefined) company.company_name_en = body.company_name_en;
    if (body.logo_url !== undefined) company.logo_url = body.logo_url;
    if (body.contact_info !== undefined) company.contact_info = body.contact_info;
    if (body.status != null) company.status = body.status;
    return HttpResponse.json(company);
  }),

  http.delete(`${API}/admin/insurance-companies/:companyId`, async ({ request, params }) => {
    const { deny } = await gate(request);
    if (deny) return deny;
    const s = adminState();
    const index = s.companies.findIndex((c) => c.id === Number(params.companyId));
    if (index === -1) return notFoundZh("保險公司不存在");
    s.companies.splice(index, 1);
    return new HttpResponse(null, { status: 204 });
  }),

  http.patch(`${API}/admin/insurance-companies/:companyId/status`, async ({ request, params }) => {
    const { deny } = await gate(request);
    if (deny) return deny;
    const company = adminState().companies.find((c) => c.id === Number(params.companyId));
    if (!company) return notFoundZh("保險公司不存在");
    const body = (await request.json()) as CompanyStatusUpdate;
    company.status = body.status;
    return HttpResponse.json(company);
  }),

  // ===== field domains / standard fields / transform rules (contract) ==========
  http.get(`${API}/admin/field-domains`, async ({ request }) => {
    const { scenario, deny } = await gate(request);
    if (deny) return deny;
    return HttpResponse.json(listItems(scenario, adminState().domains));
  }),

  http.post(`${API}/admin/field-domains`, async ({ request }) => {
    const { deny } = await gate(request);
    if (deny) return deny;
    const body = (await request.json()) as DomainCreate;
    const domain: DomainOut = {
      id: nextAdminId(),
      domain_code: body.domain_code,
      domain_name: body.domain_name,
      sort_order: body.sort_order ?? adminState().domains.length + 1,
      remark: body.remark ?? null,
    };
    adminState().domains.push(domain);
    return HttpResponse.json(domain);
  }),

  http.get(`${API}/admin/standard-fields`, async ({ request }) => {
    const { scenario, deny } = await gate(request);
    if (deny) return deny;
    const url = new URL(request.url);
    const domainId = url.searchParams.get("domain_id");
    const activeOnly = url.searchParams.get("active_only");
    const k = keyword(request);
    let rows = adminState().standardFields;
    if (domainId) rows = rows.filter((f) => f.domain_id === Number(domainId));
    if (activeOnly === "true") rows = rows.filter((f) => f.is_active);
    rows = rows.filter((f) => matches(k, f.field_code, f.field_name, f.field_name_en));
    return HttpResponse.json(listItems(scenario, rows));
  }),

  http.post(`${API}/admin/standard-fields`, async ({ request }) => {
    const { deny } = await gate(request);
    if (deny) return deny;
    const body = (await request.json()) as StandardFieldCreate;
    const field: StandardFieldOut = {
      id: nextAdminId(),
      field_code: body.field_code,
      field_name: body.field_name,
      field_name_en: body.field_name_en ?? null,
      domain_id: body.domain_id,
      data_type: body.data_type,
      enum_options: body.enum_options ?? null,
      is_required: body.is_required ?? false,
      source_type: body.source_type ?? "AI",
      ai_extraction_hint: body.ai_extraction_hint ?? null,
      validation_rule: body.validation_rule ?? null,
      example_value: body.example_value ?? null,
      is_active: true,
      created_at: nowIso(),
    };
    adminState().standardFields.unshift(field);
    return HttpResponse.json(field);
  }),

  http.put(`${API}/admin/standard-fields/:fieldId`, async ({ request, params }) => {
    const { scenario, deny } = await gate(request);
    if (deny) return deny;
    if (isConflict(scenario)) return conflictZh();
    const field = adminState().standardFields.find((f) => f.id === Number(params.fieldId));
    if (!field) return notFoundZh("標準欄位不存在");
    const body = (await request.json()) as StandardFieldUpdate;
    Object.assign(field, Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined)));
    return HttpResponse.json(field);
  }),

  http.delete(`${API}/admin/standard-fields/:fieldId`, async ({ request, params }) => {
    const { deny } = await gate(request);
    if (deny) return deny;
    const s = adminState();
    const index = s.standardFields.findIndex((f) => f.id === Number(params.fieldId));
    if (index === -1) return notFoundZh("標準欄位不存在");
    s.standardFields.splice(index, 1);
    return new HttpResponse(null, { status: 204 });
  }),

  http.get(`${API}/admin/transform-rules`, async ({ request }) => {
    const { scenario, deny } = await gate(request);
    if (deny) return deny;
    return HttpResponse.json(listItems(scenario, adminState().transformRules));
  }),

  http.post(`${API}/admin/transform-rules`, async ({ request }) => {
    const { deny } = await gate(request);
    if (deny) return deny;
    const body = (await request.json()) as TransformRuleCreate;
    const rule: TransformRuleOut = {
      id: nextAdminId(),
      rule_code: body.rule_code,
      rule_name: body.rule_name,
      rule_type: body.rule_type,
      rule_config: body.rule_config ?? null,
      remark: body.remark ?? null,
    };
    adminState().transformRules.push(rule);
    return HttpResponse.json(rule);
  }),

  // ===== templates (contract) ====================================================
  http.get(`${API}/admin/templates`, async ({ request }) => {
    const { scenario, deny } = await gate(request);
    if (deny) return deny;
    const url = new URL(request.url);
    const companyId = url.searchParams.get("company_id");
    let rows = adminState().templates;
    if (companyId) rows = rows.filter((t) => t.company_id === Number(companyId));
    return HttpResponse.json(listItems(scenario, rows));
  }),

  http.post(`${API}/admin/templates`, async ({ request }) => {
    const { deny } = await gate(request);
    if (deny) return deny;
    const form = await request.formData().catch(() => null);
    const s = adminState();
    const id = nextAdminId();
    const template: TemplateOut = {
      id,
      company_id: Number(form?.get("company_id") ?? 0),
      template_name: String(form?.get("template_name") ?? `新範本 ${id}`),
      template_code: `TPL-${String(id).padStart(4, "0")}`,
      version: "V1",
      original_pdf_url: `/local-storage/templates/${id}.pdf`,
      page_count: 2,
      page_width: 595,
      page_height: 842,
      parse_status: "PARSING",
      parse_progress: 0,
      parse_message: null,
      parse_error: null,
      is_active: false,
      created_at: nowIso(),
    };
    s.templates.unshift(template);
    s.templateFields.set(id, []);
    s.parseProgress.set(id, 0);
    return HttpResponse.json({ id, parse_status: template.parse_status });
  }),

  http.get(`${API}/admin/templates/:templateId`, async ({ request, params }) => {
    const { scenario, deny } = await gate(request);
    if (deny) return deny;
    if (isTenantNotFound(scenario)) return notFoundZh("範本不存在");
    const template = adminState().templates.find((t) => t.id === Number(params.templateId));
    if (!template) return notFoundZh("範本不存在");
    return HttpResponse.json(template);
  }),

  http.put(`${API}/admin/templates/:templateId`, async ({ request, params }) => {
    const { scenario, deny } = await gate(request);
    if (deny) return deny;
    if (isConflict(scenario)) return conflictZh();
    const template = adminState().templates.find((t) => t.id === Number(params.templateId));
    if (!template) return notFoundZh("範本不存在");
    const body = (await request.json()) as TemplateUpdate;
    if (body.template_name != null) template.template_name = body.template_name;
    if (body.company_id != null) template.company_id = body.company_id;
    return HttpResponse.json(template);
  }),

  http.delete(`${API}/admin/templates/:templateId`, async ({ request, params }) => {
    const { deny } = await gate(request);
    if (deny) return deny;
    const s = adminState();
    const index = s.templates.findIndex((t) => t.id === Number(params.templateId));
    if (index === -1) return notFoundZh("範本不存在");
    s.templates.splice(index, 1);
    return new HttpResponse(null, { status: 204 });
  }),

  http.put(`${API}/admin/templates/:templateId/file`, async ({ request, params }) => {
    const { deny } = await gate(request);
    if (deny) return deny;
    const template = adminState().templates.find((t) => t.id === Number(params.templateId));
    if (!template) return notFoundZh("範本不存在");
    template.parse_status = "PARSING";
    template.parse_progress = 0;
    adminState().parseProgress.set(template.id, 0);
    return HttpResponse.json({ id: template.id, parse_status: template.parse_status });
  }),

  http.get(`${API}/admin/templates/:templateId/parse-progress`, async ({ request, params }) => {
    const { deny } = await gate(request);
    if (deny) return deny;
    const s = adminState();
    const template = s.templates.find((t) => t.id === Number(params.templateId));
    if (!template) return notFoundZh("範本不存在");
    // Advance the simulated parse on each poll: 0 -> 34 -> 67 -> 100.
    const current = s.parseProgress.get(template.id) ?? template.parse_progress ?? 100;
    const next = Math.min(100, current + 34);
    s.parseProgress.set(template.id, next);
    template.parse_progress = next;
    if (next >= 100 && template.parse_status === "PARSING") {
      template.parse_status = "AUTO_PARSED";
    }
    return HttpResponse.json({
      percent: next,
      message: next >= 100 ? "解析完成" : "解析中…",
      status: template.parse_status,
    });
  }),

  http.post(`${API}/admin/templates/:templateId/reparse`, async ({ request, params }) => {
    const { deny } = await gate(request);
    if (deny) return deny;
    const template = adminState().templates.find((t) => t.id === Number(params.templateId));
    if (!template) return notFoundZh("範本不存在");
    template.parse_status = "PARSING";
    template.parse_progress = 0;
    template.parse_error = null;
    adminState().parseProgress.set(template.id, 0);
    return HttpResponse.json({
      id: template.id,
      parse_status: template.parse_status,
      parse_job_id: `job-${template.id}-${Date.now() % 100000}`,
    });
  }),

  http.get(`${API}/admin/templates/:templateId/fields`, async ({ request, params }) => {
    const { scenario, deny } = await gate(request);
    if (deny) return deny;
    const fields = adminState().templateFields.get(Number(params.templateId));
    if (!fields) return notFoundZh("範本不存在");
    return HttpResponse.json(listItems(scenario, fields));
  }),

  http.post(`${API}/admin/templates/:templateId/fields`, async ({ request, params }) => {
    const { deny } = await gate(request);
    if (deny) return deny;
    const s = adminState();
    const templateId = Number(params.templateId);
    const fields = s.templateFields.get(templateId);
    if (!fields) return notFoundZh("範本不存在");
    const body = (await request.json()) as TemplateFieldCreate;
    const field: TemplateFieldOut = {
      id: nextAdminId(),
      template_id: templateId,
      page_no: body.page_no,
      field_label_raw: body.field_label_raw ?? null,
      pdf_field_name: null,
      field_type: body.field_type,
      pos_x: body.pos_x,
      pos_y: body.pos_y,
      width: body.width,
      height: body.height,
      font_size: body.font_size,
      recognize_source: "MANUAL",
      confidence_score: null,
      is_confirmed: false,
      field_status: "PENDING",
      ignore_reason: null,
      row_version: 1,
      mapping: null,
    };
    fields.push(field);
    return HttpResponse.json(field);
  }),

  http.put(`${API}/admin/templates/:templateId/fields/:fieldId`, async ({ request, params }) => {
    const { scenario, deny } = await gate(request);
    if (deny) return deny;
    const fields = adminState().templateFields.get(Number(params.templateId));
    const field = fields?.find((f) => f.id === Number(params.fieldId));
    if (!field) return notFoundZh("欄位不存在");
    const body = (await request.json()) as TemplateFieldUpdate;
    // row_version optimistic lock: a stale version returns the 409 outcome.
    if (isConflict(scenario) || body.row_version !== field.row_version) return conflictZh();
    const rest: Partial<TemplateFieldUpdate> = { ...body };
    delete rest.row_version;
    Object.assign(field, Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)));
    field.row_version += 1;
    return HttpResponse.json(field);
  }),

  http.delete(`${API}/admin/templates/:templateId/fields/:fieldId`, async ({ request, params }) => {
    const { scenario, deny } = await gate(request);
    if (deny) return deny;
    if (isConflict(scenario)) return conflictZh();
    const fields = adminState().templateFields.get(Number(params.templateId));
    const index = fields?.findIndex((f) => f.id === Number(params.fieldId)) ?? -1;
    if (!fields || index === -1) return notFoundZh("欄位不存在");
    fields.splice(index, 1);
    return new HttpResponse(null, { status: 204 });
  }),

  http.post(
    `${API}/admin/templates/:templateId/fields/:fieldId/mapping`,
    async ({ request, params }) => {
      const { scenario, deny } = await gate(request);
      if (deny) return deny;
      if (isConflict(scenario)) return conflictZh();
      const fields = adminState().templateFields.get(Number(params.templateId));
      const field = fields?.find((f) => f.id === Number(params.fieldId));
      if (!field) return notFoundZh("欄位不存在");
      const body = (await request.json()) as FieldMappingSave;
      field.mapping = {
        standard_field_id: body.standard_field_id ?? null,
        fixed_value: body.fixed_value ?? null,
        checkbox_map_value: body.checkbox_map_value ?? null,
        transform_rule_id: body.transform_rule_id ?? null,
      } as TemplateFieldOut["mapping"];
      if (body.confirm) {
        field.is_confirmed = true;
        field.field_status = "MAPPED";
      }
      field.row_version += 1;
      return HttpResponse.json({ id: field.id });
    },
  ),

  http.patch(
    `${API}/admin/templates/:templateId/fields/:fieldId/ignore`,
    async ({ request, params }) => {
      const { scenario, deny } = await gate(request);
      if (deny) return deny;
      const fields = adminState().templateFields.get(Number(params.templateId));
      const field = fields?.find((f) => f.id === Number(params.fieldId));
      if (!field) return notFoundZh("欄位不存在");
      const body = (await request.json()) as FieldIgnoreSave;
      if (isConflict(scenario) || body.row_version !== field.row_version) return conflictZh();
      field.field_status = "IGNORED";
      field.ignore_reason = body.reason ?? null;
      field.row_version += 1;
      return HttpResponse.json(field);
    },
  ),

  http.patch(
    `${API}/admin/templates/:templateId/fields/:fieldId/restore`,
    async ({ request, params }) => {
      const { scenario, deny } = await gate(request);
      if (deny) return deny;
      const fields = adminState().templateFields.get(Number(params.templateId));
      const field = fields?.find((f) => f.id === Number(params.fieldId));
      if (!field) return notFoundZh("欄位不存在");
      const body = (await request.json()) as FieldRestoreSave;
      if (isConflict(scenario) || body.row_version !== field.row_version) return conflictZh();
      field.field_status = field.mapping ? "MAPPED" : "PENDING";
      field.ignore_reason = null;
      field.row_version += 1;
      return HttpResponse.json(field);
    },
  ),

  http.get(`${API}/admin/templates/:templateId/publish-preview`, async ({ request, params }) => {
    const { deny } = await gate(request);
    if (deny) return deny;
    const fields = adminState().templateFields.get(Number(params.templateId));
    if (!fields) return notFoundZh("範本不存在");
    const active = fields.filter((f) => f.field_status !== "IGNORED");
    const processed = active.filter((f) => f.field_status === "MAPPED" || f.is_confirmed);
    const pending = active.filter((f) => !(f.field_status === "MAPPED" || f.is_confirmed));
    return HttpResponse.json({
      total_count: active.length,
      processed_count: processed.length,
      pending_count: pending.length,
      missing_required: pending.slice(0, 5).map((f) => f.field_label_raw ?? String(f.id)),
    });
  }),

  http.post(`${API}/admin/templates/:templateId/preview-fill`, async ({ request, params }) => {
    const { deny } = await gate(request);
    if (deny) return deny;
    const template = adminState().templates.find((t) => t.id === Number(params.templateId));
    if (!template) return notFoundZh("範本不存在");
    return HttpResponse.json({
      preview_pdf_url: `/local-storage/previews/${template.template_code}-preview.pdf`,
    });
  }),

  http.post(`${API}/admin/templates/:templateId/publish`, async ({ request, params }) => {
    const { deny } = await gate(request);
    if (deny) return deny;
    const template = adminState().templates.find((t) => t.id === Number(params.templateId));
    if (!template) return notFoundZh("範本不存在");
    template.parse_status = "PUBLISHED";
    template.is_active = true;
    recordAuditEvent({
      operator: "you@acuity",
      action: "template-publish",
      target: template.template_code,
      mode: null,
    });
    return HttpResponse.json(template);
  }),

  // ===== frontend-only: audit events ============================================
  http.get(`${API}/admin/audit-events`, async ({ request }) => {
    const { scenario, deny } = await gate(request);
    if (deny) return deny;
    const url = new URL(request.url);
    const operator = url.searchParams.get("operator");
    const action = url.searchParams.get("action");
    const clinicCode = url.searchParams.get("clinic_code");
    let rows = frontendOnlyState().auditEvents;
    if (operator) rows = rows.filter((e) => e.operator.toLowerCase().includes(operator.toLowerCase()));
    if (action) rows = rows.filter((e) => e.action === action);
    if (clinicCode) rows = rows.filter((e) => e.target.toLowerCase().includes(clinicCode.toLowerCase()));
    const { pageNo, pageSize } = pageQuery(request);
    return HttpResponse.json(page(listItems(scenario, rows), pageNo, pageSize));
  }),

  http.post(`${API}/admin/audit-events`, async ({ request }) => {
    const { deny } = await gate(request);
    if (deny) return deny;
    const body = (await request.json()) as AuditEventCreate;
    const event = recordAuditEvent({
      operator: "you@acuity",
      action: body.action,
      target: body.target,
      mode: body.mode ?? null,
    });
    return HttpResponse.json(event);
  }),

  // ===== frontend-only: tickets + onboarding queue ================================
  http.get(`${API}/admin/tickets`, async ({ request }) => {
    const { scenario, deny } = await gate(request);
    if (deny) return deny;
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const owner = url.searchParams.get("owner");
    let rows = frontendOnlyState().tickets;
    if (status) rows = rows.filter((t) => t.status === status);
    if (owner) rows = rows.filter((t) => t.owner === owner);
    const { pageNo, pageSize } = pageQuery(request);
    return HttpResponse.json(page(listItems(scenario, rows), pageNo, pageSize));
  }),

  http.get(`${API}/admin/onboarding-queue`, async ({ request }) => {
    const { scenario, deny } = await gate(request);
    if (deny) return deny;
    return HttpResponse.json(listItems(scenario, frontendOnlyState().onboardingQueue));
  }),

  http.get(`${API}/admin/tickets/:ticketId`, async ({ request, params }) => {
    const { deny } = await gate(request);
    if (deny) return deny;
    const ticket = frontendOnlyState().tickets.find((t) => t.id === params.ticketId);
    if (!ticket) return notFoundZh("工單不存在");
    return HttpResponse.json(ticket);
  }),

  http.put(`${API}/admin/tickets/:ticketId`, async ({ request, params }) => {
    const { scenario, deny } = await gate(request);
    if (deny) return deny;
    if (isConflict(scenario)) return conflictZh();
    const ticket = frontendOnlyState().tickets.find((t) => t.id === params.ticketId);
    if (!ticket) return notFoundZh("工單不存在");
    const body = (await request.json()) as TicketUpdate;
    if (body.status !== undefined) ticket.status = body.status;
    if (body.owner !== undefined) ticket.owner = body.owner;
    if (body.add_note) ticket.notes.push(body.add_note);
    ticket.updated_at = nowIso();
    return HttpResponse.json(ticket);
  }),

  http.post(`${API}/admin/tickets/:ticketId/resolve`, async ({ request, params }) => {
    const { deny } = await gate(request);
    if (deny) return deny;
    const ticket = frontendOnlyState().tickets.find((t) => t.id === params.ticketId);
    if (!ticket) return notFoundZh("工單不存在");
    const body = (await request.json().catch(() => ({}))) as { resolution_note?: string };
    ticket.status = "resolved";
    if (body.resolution_note) ticket.notes.push(body.resolution_note);
    ticket.updated_at = nowIso();
    return HttpResponse.json(ticket);
  }),

  // ===== frontend-only: tags + visibility =========================================
  // /admin/tags/visibility is registered before /admin/tags/:tagId so the literal
  // segment never matches as a tag id.
  http.get(`${API}/admin/tags/visibility`, async ({ request }) => {
    const { scenario, deny } = await gate(request);
    if (deny) return deny;
    const url = new URL(request.url);
    const doctorId = url.searchParams.get("doctor_id");
    let rows = frontendOnlyState().tagVisibility;
    if (doctorId) rows = rows.filter((v) => v.doctor_id === Number(doctorId));
    return HttpResponse.json(listItems(scenario, rows));
  }),

  http.put(`${API}/admin/tags/visibility`, async ({ request }) => {
    const { deny } = await gate(request);
    if (deny) return deny;
    const body = (await request.json()) as { entries: TagVisibilityEntry[] };
    const state = frontendOnlyState();
    for (const entry of body.entries) {
      const existing = state.tagVisibility.find(
        (v) => v.doctor_id === entry.doctor_id && v.tag_id === entry.tag_id,
      );
      if (existing) existing.visible = entry.visible;
      else state.tagVisibility.push({ ...entry });
    }
    return HttpResponse.json({ success: true });
  }),

  http.get(`${API}/admin/tags`, async ({ request }) => {
    const { scenario, deny } = await gate(request);
    if (deny) return deny;
    const url = new URL(request.url);
    const kind = url.searchParams.get("kind");
    let rows = frontendOnlyState().tags;
    if (kind) rows = rows.filter((t) => t.kind === kind);
    return HttpResponse.json(listItems(scenario, rows));
  }),

  http.post(`${API}/admin/tags`, async ({ request }) => {
    const { deny } = await gate(request);
    if (deny) return deny;
    const body = (await request.json()) as TagCreate;
    const state = frontendOnlyState();
    const tag: Tag = {
      id: 9000 + state.tags.length + 1,
      kind: body.kind,
      label_zh: body.label_zh,
      label_en: body.label_en,
      parent_id: body.parent_id ?? null,
      sort_order: body.sort_order ?? state.tags.length + 1,
      retired: false,
    };
    state.tags.push(tag);
    recordAuditEvent({ operator: "you@acuity", action: "tag-change", target: tag.label_en, mode: null });
    return HttpResponse.json(tag);
  }),

  http.put(`${API}/admin/tags/:tagId`, async ({ request, params }) => {
    const { scenario, deny } = await gate(request);
    if (deny) return deny;
    if (isConflict(scenario)) return conflictZh();
    const tag = frontendOnlyState().tags.find((t) => t.id === Number(params.tagId));
    if (!tag) return notFoundZh("標籤不存在");
    const body = (await request.json()) as TagUpdate;
    if (body.label_zh !== undefined) tag.label_zh = body.label_zh;
    if (body.label_en !== undefined) tag.label_en = body.label_en;
    if (body.parent_id !== undefined) tag.parent_id = body.parent_id;
    if (body.sort_order !== undefined) tag.sort_order = body.sort_order;
    return HttpResponse.json(tag);
  }),

  http.post(`${API}/admin/tags/:tagId/retire`, async ({ request, params }) => {
    const { deny } = await gate(request);
    if (deny) return deny;
    const state = frontendOnlyState();
    const tag = state.tags.find((t) => t.id === Number(params.tagId));
    if (!tag) return notFoundZh("標籤不存在");
    const body = (await request.json().catch(() => ({}))) as TagRetireRequest;
    tag.retired = true;
    // Tag-integrity rule: visibility rows re-map to the target tag (never orphan).
    let remapped = 0;
    if (body.remap_to_tag_id != null) {
      for (const v of state.tagVisibility) {
        if (v.tag_id === tag.id) {
          v.tag_id = body.remap_to_tag_id;
          remapped += 1;
        }
      }
    }
    recordAuditEvent({ operator: "you@acuity", action: "tag-change", target: tag.label_en, mode: null });
    return HttpResponse.json({ tag, remapped_count: remapped });
  }),

  // ===== frontend-only: analytics ==================================================
  http.get(`${API}/admin/analytics/overview`, async ({ request }) => {
    const { deny } = await gate(request);
    if (deny) return deny;
    return HttpResponse.json(analyticsOverview);
  }),

  http.get(`${API}/admin/analytics/usage`, async ({ request }) => {
    const { scenario, deny } = await gate(request);
    if (deny) return deny;
    const url = new URL(request.url);
    const rangeDays = Number(url.searchParams.get("range_days")) || 30;
    const series = url.searchParams.get("report") === "errors" ? analyticsErrors : analyticsUsage;
    return HttpResponse.json(listItems(scenario, series.slice(-rangeDays)));
  }),

  http.get(`${API}/admin/analytics/funnel`, async ({ request }) => {
    const { deny } = await gate(request);
    if (deny) return deny;
    return HttpResponse.json(analyticsFunnel);
  }),

  http.get(`${API}/admin/analytics/verification`, async ({ request }) => {
    const { deny } = await gate(request);
    if (deny) return deny;
    return HttpResponse.json(analyticsVerification);
  }),

  http.get(`${API}/admin/analytics/quality`, async ({ request }) => {
    const { deny } = await gate(request);
    if (deny) return deny;
    return HttpResponse.json(analyticsQuality);
  }),

  http.post(`${API}/admin/analytics/export`, async ({ request }) => {
    const { deny } = await gate(request);
    if (deny) return deny;
    const body = (await request.json().catch(() => ({}))) as { report?: string };
    // Surrogate-only export, always logged.
    const event = recordAuditEvent({
      operator: "you@acuity",
      action: "export",
      target: `analytics/${body.report ?? "usage"}`,
      mode: null,
    });
    return HttpResponse.json({
      export_url: `/local-storage/exports/${body.report ?? "usage"}-${Date.now() % 100000}.csv`,
      logged_event_id: event.id,
    });
  }),

  // ===== frontend-only: saved views ================================================
  http.get(`${API}/admin/saved-views`, async ({ request }) => {
    const { scenario, deny } = await gate(request);
    if (deny) return deny;
    const url = new URL(request.url);
    const grid = url.searchParams.get("grid");
    let rows = frontendOnlyState().savedViews;
    if (grid) rows = rows.filter((v) => v.grid === grid);
    return HttpResponse.json(listItems(scenario, rows));
  }),

  http.post(`${API}/admin/saved-views`, async ({ request }) => {
    const { deny } = await gate(request);
    if (deny) return deny;
    const body = (await request.json()) as SavedViewCreate;
    const state = frontendOnlyState();
    const view: SavedView = {
      id: nextFrontendOnlyId("sv"),
      grid: body.grid,
      name: body.name,
      filters: body.filters ?? {},
      sort: body.sort ?? "",
      is_default: body.is_default ?? false,
      starred: body.starred ?? false,
    };
    if (view.is_default) {
      for (const v of state.savedViews) if (v.grid === view.grid) v.is_default = false;
    }
    state.savedViews.push(view);
    return HttpResponse.json(view);
  }),

  http.put(`${API}/admin/saved-views/:viewId`, async ({ request, params }) => {
    const { deny } = await gate(request);
    if (deny) return deny;
    const state = frontendOnlyState();
    const view = state.savedViews.find((v) => v.id === params.viewId);
    if (!view) return notFoundZh("檢視不存在");
    const body = (await request.json()) as SavedViewUpdate;
    if (body.name !== undefined) view.name = body.name;
    if (body.filters !== undefined) view.filters = body.filters;
    if (body.sort !== undefined) view.sort = body.sort;
    if (body.starred !== undefined) view.starred = body.starred;
    if (body.is_default !== undefined) {
      if (body.is_default) {
        for (const v of state.savedViews) if (v.grid === view.grid) v.is_default = false;
      }
      view.is_default = body.is_default;
    }
    return HttpResponse.json(view);
  }),

  http.delete(`${API}/admin/saved-views/:viewId`, async ({ request, params }) => {
    const { deny } = await gate(request);
    if (deny) return deny;
    const state = frontendOnlyState();
    const index = state.savedViews.findIndex((v) => v.id === params.viewId);
    if (index === -1) return notFoundZh("檢視不存在");
    state.savedViews.splice(index, 1);
    return new HttpResponse(null, { status: 204 });
  }),

  // ===== frontend-only: impersonation (support access, console side) ================
  http.get(`${API}/admin/impersonation/session`, async ({ request }) => {
    const { deny } = await gate(request);
    if (deny) return deny;
    return HttpResponse.json({ active: frontendOnlyState().impersonation });
  }),

  http.post(`${API}/admin/impersonation/start`, async ({ request }) => {
    const { deny } = await gate(request);
    if (deny) return deny;
    const body = (await request.json()) as ImpersonationStartRequest;
    const now = Date.now();
    const session: ImpersonationSession = {
      id: nextFrontendOnlyId("imp"),
      clinic_id: body.clinic_id,
      doctor_id: body.doctor_id,
      operator: "you@acuity",
      mode: body.mode,
      started_at: new Date(now).toISOString(),
      expires_at: new Date(now + (body.duration_minutes ?? 30) * 60_000).toISOString(),
    };
    frontendOnlyState().impersonation = session;
    recordAuditEvent({
      operator: session.operator,
      action: "impersonation-start",
      target: `clinic:${session.clinic_id} doctor:${session.doctor_id}`,
      mode: session.mode,
    });
    return HttpResponse.json(session);
  }),

  http.post(`${API}/admin/impersonation/end`, async ({ request }) => {
    const { deny } = await gate(request);
    if (deny) return deny;
    const state = frontendOnlyState();
    const session = state.impersonation;
    if (session) {
      recordAuditEvent({
        operator: session.operator,
        action: "impersonation-end",
        target: `clinic:${session.clinic_id} doctor:${session.doctor_id}`,
        mode: session.mode,
      });
    }
    state.impersonation = null;
    return HttpResponse.json({ success: true });
  }),

  // ===== frontend-only: PHI-redacted claims oversight ================================
  // Reads the live claims store so the console reflects doctor-app mutations;
  // patient names + AI raw results are withheld at portfolio level.
  http.get(`${API}/admin/claims`, async ({ request }) => {
    const { scenario, deny } = await gate(request);
    if (deny) return deny;
    const url = new URL(request.url);
    const clinicId = url.searchParams.get("clinic_id");
    const status = url.searchParams.get("status");
    let entries = listClaimEntries();
    if (clinicId) entries = entries.filter((e) => e.claim.clinic_id === Number(clinicId));
    if (status) entries = entries.filter((e) => e.claim.status === status);
    const items = entries.map((e) => ({
      id: e.claim.id,
      submission_no: e.claim.submission_no,
      patient_name: null,
      company_id: e.claim.company_id,
      template_id: e.claim.template_id,
      status: e.claim.status,
      created_at: e.claim.created_at,
    }));
    const { pageNo, pageSize } = pageQuery(request);
    return HttpResponse.json(page(listItems(scenario, items), pageNo, pageSize));
  }),

  http.get(`${API}/admin/claims/:claimId`, async ({ request, params }) => {
    const { scenario, deny } = await gate(request);
    if (deny) return deny;
    if (isTenantNotFound(scenario)) return notFoundZh("理賠記錄不存在");
    const entry = listClaimEntries().find((e) => e.claim.id === Number(params.claimId));
    if (!entry) return notFoundZh("理賠記錄不存在");
    return HttpResponse.json({ ...entry.claim, patient_name: null, ai_raw_result: null });
  }),
];
