// Doctor-surface handlers — the full /api/doctor/* contract (16 operations)
// implemented statefully over the claims store, plus the FRONTEND-ONLY doctor
// modules (coverage registry, document inbox, claim extensions, staff hand-off,
// settings, notifications, support access). The DRAFT -> AI_FILLED ->
// CONFIRMED -> PRINTED loop is stateful across navigations; tenant isolation
// returns 404 (never 403); the field save demonstrates the 409 optimistic lock
// via the round-tripped row_version; AI extraction degrades to 503
// AI_UNAVAILABLE under the ai-degrade scenario (force_manual path).

import { HttpResponse, http } from "msw";
import type {
  ClaimListItem,
  ClaimOut,
  DraftSave,
  ExtractRequest,
  ExtractResponse,
  FieldsUpdate,
  MedicalRecordSubmit,
  ReuseRequest,
} from "@acuity/types";
import type { HandoffCreate, StaffHandoff } from "../../endpoints/frontend-only/staff-handoff";
import type { DoctorSettingsUpdate } from "../../endpoints/frontend-only/doctor-settings";
import type {
  SupportAccessGrant,
  SupportAccessGrantRequest,
} from "../../endpoints/frontend-only/support-access";
import {
  coverageRegistry,
  demoCompanies,
  demoTemplatesByCompany,
  extractionCanned,
  getTemplateFieldSchema,
  homeOverviewFrom,
  intakeRecords,
  sessionClinicId,
  sessionDoctorId,
} from "../fixtures/index";
import {
  createClaimEntry,
  deleteClaimEntry,
  getClaimEntryScoped,
  listClaimEntries,
  updateClaimEntry,
  type ClaimStoreEntry,
} from "../stores/claims-store";
import { sessionClinicScope } from "../stores/auth-store";
import { adminState } from "../stores/admin-store";
import { frontendOnlyState, nextFrontendOnlyId } from "../stores/frontend-only-store";
import { isAiDegraded, isConflict, isTenantNotFound, listItems } from "../scenario";
import { API, conflictZh, errorEnvelope, gate, notFoundZh, page, pageQuery } from "./shared";

const CLAIM_NOT_FOUND = "理賠記錄不存在";

// The session's clinic scope: one clinic when selected, every linked clinic
// for a merged workspace (ADR 0041 §6), the fixture default when the mock
// boots pre-journey. Merging widens which per-clinic scopes the session reads;
// it never blends them into one scope.
function activeClinicScope(): number[] {
  const scope = sessionClinicScope();
  return scope.length > 0 ? scope : [sessionClinicId];
}

// New records always belong to ONE clinic. In a merged workspace that is the
// primary (first) link — the contract-compat artifact clinic_id also carries.
function primaryClinicId(): number {
  return activeClinicScope()[0] ?? sessionClinicId;
}

function scopedEntry(id: number): ClaimStoreEntry | undefined {
  return getClaimEntryScoped(id, activeClinicScope());
}

// Combined bilingual clinic label ("中環家庭醫療中心 Central Family Medical"),
// read live from the admin store so console renames flow through.
function clinicDisplayName(clinicId: number): string | null {
  const clinic = adminState().clinics.find((c) => c.id === clinicId);
  if (!clinic) return null;
  return [clinic.clinic_name, clinic.clinic_name_en ?? ""].join(" ").trim();
}

function toListItem(claim: ClaimOut): ClaimListItem {
  const company = demoCompanies.find((c) => c.id === claim.company_id);
  const template = Object.values(demoTemplatesByCompany)
    .flat()
    .find((t) => t.id === claim.template_id);
  const cn = (claim as ClaimOut & { patient_name_cn?: string | null }).patient_name_cn ?? null;
  const en = (claim as ClaimOut & { patient_name_en?: string | null }).patient_name_en ?? null;
  const display =
    cn && en ? `${cn} / ${en}` : cn || en || claim.patient_name;
  return {
    id: claim.id,
    submission_no: claim.submission_no,
    patient_name: display,
    patient_name_cn: cn,
    patient_name_en: en,
    company_id: claim.company_id,
    template_id: claim.template_id,
    status: claim.status,
    created_at: claim.created_at,
    clinic_id: claim.clinic_id,
    clinic_name: clinicDisplayName(claim.clinic_id),
    company_name: company?.company_name ?? null,
    company_name_en: company?.company_name_en ?? null,
    template_name: template?.template_name ?? null,
  } as ClaimListItem;
}

// Simulate the AI extraction: draft values + per-field confidence from the
// canned result, intersected with the template's field schema so untouched
// fields stay needing input (honest partial state).
function extractionResult(templateId: number): {
  final_field_values: Record<string, string>;
  ai_raw_result: Record<string, { value: string; confidence: number }>;
} {
  const schema = getTemplateFieldSchema(templateId);
  const final: Record<string, string> = {};
  const raw: Record<string, { value: string; confidence: number }> = {};
  for (const field of schema.fields) {
    const hit = extractionCanned[field.field_code];
    if (hit) {
      final[field.field_code] = hit.value;
      raw[field.field_code] = hit;
    }
  }
  return { final_field_values: final, ai_raw_result: raw };
}

function fillFromExtraction(entry: ClaimStoreEntry): void {
  const result = extractionResult(entry.claim.template_id);
  entry.claim.ai_raw_result = result.ai_raw_result;
  entry.claim.final_field_values = result.final_field_values;
  entry.claim.ai_token_usage = 412;
  entry.claim.ai_process_time_ms = 1830;
  entry.claim.status = "AI_FILLED";
  // Drafted -> unconfirmed; nothing confirmed yet.
  entry.confirmed = {};
}

const aiUnavailable = () => errorEnvelope("AI_UNAVAILABLE", "AI 服務暫時無法使用", 503);

export const doctorHandlers = [
  // --- home + catalog (contract) ---------------------------------------------
  http.get(`${API}/doctor/home/overview`, async ({ request }) => {
    const { deny } = await gate(request);
    if (deny) return deny;
    const scope = activeClinicScope();
    const claims = listClaimEntries({ clinicIds: scope }).map((e) => e.claim);
    // The clinic label reflects the ACTIVE clinic (not a fixture constant); a
    // merged workspace keeps the primary's name in the contract field and the
    // app renders its own combined-workspace label off the session marker.
    const label = clinicDisplayName(primaryClinicId());
    return HttpResponse.json(homeOverviewFrom(claims, label ?? undefined));
  }),

  http.get(`${API}/doctor/insurance-companies`, async ({ request }) => {
    const { scenario, deny } = await gate(request);
    if (deny) return deny;
    return HttpResponse.json(listItems(scenario, demoCompanies));
  }),

  http.get(`${API}/doctor/insurance-companies/:companyId/templates`, async ({ request, params }) => {
    const { scenario, deny } = await gate(request);
    if (deny) return deny;
    const templates = demoTemplatesByCompany[Number(params.companyId)] ?? [];
    return HttpResponse.json(listItems(scenario, templates));
  }),

  // --- claims list + detail (contract) ----------------------------------------
  http.get(`${API}/doctor/claims`, async ({ request }) => {
    const { scenario, deny } = await gate(request);
    if (deny) return deny;
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const statusNe = url.searchParams.get("status_ne");
    const patientName = url.searchParams.get("patient_name");
    let items = listClaimEntries({ clinicIds: activeClinicScope() }).map((e) =>
      toListItem(e.claim),
    );
    if (status) {
      const allowed = new Set(
        status
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      );
      items = items.filter((c) => allowed.has(c.status));
    }
    if (statusNe) {
      const excluded = new Set(
        statusNe
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      );
      items = items.filter((c) => !excluded.has(c.status));
    }
    if (patientName) {
      const needle = patientName.toLowerCase();
      items = items.filter((c) => (c.patient_name ?? "").toLowerCase().includes(needle));
    }
    const { pageNo, pageSize } = pageQuery(request);
    return HttpResponse.json(page(listItems(scenario, items), pageNo, pageSize));
  }),

  http.get(`${API}/doctor/claims/:claimId`, async ({ request, params }) => {
    const { scenario, deny } = await gate(request);
    if (deny) return deny;
    if (isTenantNotFound(scenario)) return notFoundZh(CLAIM_NOT_FOUND);
    const entry = scopedEntry(Number(params.claimId));
    // Tenant isolation returns not-found, not forbidden.
    if (!entry) return notFoundZh(CLAIM_NOT_FOUND);
    return HttpResponse.json(entry.claim);
  }),

  http.post(`${API}/doctor/claims`, async ({ request }) => {
    const { scenario, deny } = await gate(request);
    if (deny) return deny;
    if (isConflict(scenario)) return conflictZh();
    const input = (await request.json()) as { company_id: number; template_id: number };
    const entry = createClaimEntry(input.company_id, input.template_id, {
      clinicId: primaryClinicId(),
      doctorId: sessionDoctorId,
    });
    return HttpResponse.json(entry.claim);
  }),

  // --- draft save (contract) ---------------------------------------------------
  http.put(`${API}/doctor/claims/:claimId/draft`, async ({ request, params }) => {
    const { scenario, deny } = await gate(request);
    if (deny) return deny;
    if (isConflict(scenario)) return conflictZh();
    const body = (await request.json()) as DraftSave;
    if (!scopedEntry(Number(params.claimId))) return notFoundZh(CLAIM_NOT_FOUND);
    updateClaimEntry(Number(params.claimId), (entry) => {
      if (body.patient_name !== undefined && body.patient_name !== null) {
        entry.claim.patient_name = body.patient_name;
      }
      if (body.medical_record_text !== undefined && body.medical_record_text !== null) {
        entry.intakeText = body.medical_record_text;
      }
    });
    return HttpResponse.json({ saved_at: new Date().toISOString() });
  }),

  // --- medical PDF upload (live backend; mock for local demos) ----------------
  http.post(`${API}/doctor/claims/:claimId/medical-pdf`, async ({ request, params }) => {
    const { deny } = await gate(request);
    if (deny) return deny;
    const claimId = Number(params.claimId);
    const entry = scopedEntry(claimId);
    if (!entry) return notFoundZh(CLAIM_NOT_FOUND);
    const form = await request.formData();
    const file = form.get("file");
    if (typeof file === "string" || file == null) {
      return HttpResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "请上传 PDF 文件" } },
        { status: 422 },
      );
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const filename = "name" in file && file.name ? file.name : "upload.pdf";
    const taskNo = `MOCK-TASK-${claimId}-${Date.now()}`;
    updateClaimEntry(claimId, (e) => {
      e.medicalPdfBytes = bytes;
      e.extractionTaskNo = taskNo;
      e.intakeText = e.intakeText ?? `[PDF] ${filename}`;
      // ClaimOut contract may not yet list these; attach for medical-review resume.
      (e.claim as ClaimOut & { extraction_task_no?: string }).extraction_task_no = taskNo;
    });
    return HttpResponse.json({
      extraction_task_id: claimId * 1000 + 1,
      extraction_task_no: taskNo,
      original_filename: filename,
      patient_name: entry.claim.patient_name,
    });
  }),

  http.get(`${API}/doctor/extraction-tasks/:taskNo/pdf`, async ({ request, params }) => {
    const { deny } = await gate(request);
    if (deny) return deny;
    const taskNo = String(params.taskNo);
    const entry = Array.from(
      // Prefer an entry that owns this task number.
      listClaimEntries({ clinicIds: activeClinicScope() }),
    ).find((e) => e.extractionTaskNo === taskNo);
    const bytes = entry?.medicalPdfBytes;
    if (!bytes || bytes.byteLength === 0) {
      // Tiny valid empty PDF so the iframe still loads in demos without a file.
      const minimal = new TextEncoder().encode(
        "%PDF-1.1\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n",
      );
      return new HttpResponse(minimal, {
        headers: { "Content-Type": "application/pdf" },
      });
    }
    return new HttpResponse(bytes, {
      headers: { "Content-Type": "application/pdf" },
    });
  }),

  http.post(`${API}/doctor/claims/:claimId/extract-from-pdf`, async ({ request, params }) => {
    const { scenario, deny } = await gate(request);
    if (deny) return deny;
    if (isAiDegraded(scenario)) return aiUnavailable();
    const claimId = Number(params.claimId);
    const entry = scopedEntry(claimId);
    if (!entry) return notFoundZh(CLAIM_NOT_FOUND);
    if (!entry.extractionTaskNo) {
      return errorEnvelope("VALIDATION_ERROR", "请先上传病历 PDF", 422);
    }
    updateClaimEntry(claimId, (e) => {
      (e as ClaimStoreEntry & { extractStatus?: string }).extractStatus = "RUNNING";
      (e as ClaimStoreEntry & { extractStartedAt?: number }).extractStartedAt = Date.now();
    });
    return HttpResponse.json({ job_id: `mock-job-${claimId}`, status: "QUEUED" }, { status: 202 });
  }),

  http.get(`${API}/doctor/claims/:claimId/extract-progress`, async ({ request, params }) => {
    const { deny } = await gate(request);
    if (deny) return deny;
    const claimId = Number(params.claimId);
    const entry = scopedEntry(claimId);
    if (!entry) return notFoundZh(CLAIM_NOT_FOUND);
    const startedAt = (entry as ClaimStoreEntry & { extractStartedAt?: number }).extractStartedAt;
    const status = (entry as ClaimStoreEntry & { extractStatus?: string }).extractStatus;
    if (!startedAt || status === "IDLE" || !status) {
      return HttpResponse.json({
        stage: "IDLE",
        percent: 0,
        message: null,
        status: "IDLE",
        visits: null,
      });
    }
    const elapsed = Date.now() - startedAt;
    if (elapsed < 800) {
      return HttpResponse.json({
        stage: "INGEST",
        percent: 20,
        message: "正在预处理病历…",
        status: "RUNNING",
        visits: null,
      });
    }
    if (elapsed < 1600) {
      return HttpResponse.json({
        stage: "EXTRACT",
        percent: 70,
        message: "正在 AI 识别…",
        status: "RUNNING",
        visits: null,
      });
    }
    updateClaimEntry(claimId, (e) => {
      (e as ClaimStoreEntry & { extractStatus?: string }).extractStatus = "DONE";
    });
    return HttpResponse.json({
      stage: "DONE",
      percent: 100,
      message: "提取完成",
      status: "DONE",
      visits: null,
    });
  }),

  http.post(`${API}/doctor/claims/:claimId/cancel-extraction`, async ({ request, params }) => {
    const { deny } = await gate(request);
    if (deny) return deny;
    const claimId = Number(params.claimId);
    if (!scopedEntry(claimId)) return notFoundZh(CLAIM_NOT_FOUND);
    const updated = updateClaimEntry(claimId, (e) => {
      (e as ClaimStoreEntry & { extractStatus?: string }).extractStatus = "IDLE";
      (e as ClaimStoreEntry & { extractStartedAt?: number }).extractStartedAt = undefined;
    });
    return HttpResponse.json(updated!.claim);
  }),

  http.post(`${API}/doctor/claims/:claimId/apply-extraction`, async ({ request, params }) => {
    const { deny } = await gate(request);
    if (deny) return deny;
    const claimId = Number(params.claimId);
    if (!scopedEntry(claimId)) return notFoundZh(CLAIM_NOT_FOUND);
    const updated = updateClaimEntry(claimId, fillFromExtraction);
    return HttpResponse.json(updated!.claim);
  }),

  http.post(`${API}/doctor/claims/:claimId/reset-medical-upload`, async ({ request, params }) => {
    const { deny } = await gate(request);
    if (deny) return deny;
    const claimId = Number(params.claimId);
    if (!scopedEntry(claimId)) return notFoundZh(CLAIM_NOT_FOUND);
    const updated = updateClaimEntry(claimId, (e) => {
      e.medicalPdfBytes = null;
      e.extractionTaskNo = null;
      (e.claim as ClaimOut & { extraction_task_no?: string | null }).extraction_task_no = null;
      (e as ClaimStoreEntry & { extractStatus?: string }).extractStatus = "IDLE";
      (e as ClaimStoreEntry & { extractStartedAt?: number }).extractStartedAt = undefined;
      e.claim.ai_raw_result = null;
      e.claim.final_field_values = null;
      e.claim.status = "DRAFT";
    });
    return HttpResponse.json(updated!.claim);
  }),

  http.get(`${API}/doctor/claims/:claimId/template-specific-ai-fields`, async ({ request, params }) => {
    const { deny } = await gate(request);
    if (deny) return deny;
    if (!scopedEntry(Number(params.claimId))) return notFoundZh(CLAIM_NOT_FOUND);
    return HttpResponse.json([]);
  }),

  http.get(`${API}/doctor/extraction-tasks/:taskNo/review-output`, async ({ request, params }) => {
    const { deny } = await gate(request);
    if (deny) return deny;
    const taskNo = String(params.taskNo);
    const entry = listClaimEntries({ clinicIds: activeClinicScope() }).find(
      (e) => e.extractionTaskNo === taskNo,
    );
    if (!entry) return notFoundZh("提取任务不存在");
    const result = extractionResult(entry.claim.template_id);
    const display_fields: Record<
      string,
      {
        value: string | null;
        status: string;
        confidence: number;
        validation_error: string | null;
      }
    > = Object.fromEntries(
      Object.entries(result.final_field_values).map(([code, value]) => [
        code,
        {
          value,
          status: "extracted",
          confidence: result.ai_raw_result[code]?.confidence ?? 0.9,
          validation_error: null,
        },
      ]),
    );
    // Ensure schema fields appear even when canned data misses them.
    for (const field of getTemplateFieldSchema(entry.claim.template_id).fields) {
      if (!display_fields[field.field_code]) {
        display_fields[field.field_code] = {
          value: null,
          status: "missing",
          confidence: 0,
          validation_error: null,
        };
      }
    }
    // Prefer claim.final_field_values so save-draft → refresh keeps doctor edits.
    for (const [code, value] of Object.entries(entry.claim.final_field_values ?? {})) {
      const existing = display_fields[code];
      display_fields[code] = {
        value: value ?? null,
        status: existing?.status === "missing" ? "edited" : (existing?.status ?? "edited"),
        confidence: existing?.confidence ?? 1,
        validation_error: existing?.validation_error ?? null,
      };
    }
    return HttpResponse.json({
      task_id: taskNo,
      display_fields,
      standard_fields: display_fields,
      template_specific_field_codes: [],
      field_labels: null,
      is_confirmed: false,
    });
  }),

  http.put(`${API}/doctor/extraction-tasks/:taskNo/review-output`, async ({ request, params }) => {
    const { deny } = await gate(request);
    if (deny) return deny;
    const taskNo = String(params.taskNo);
    const entry = listClaimEntries({ clinicIds: activeClinicScope() }).find(
      (e) => e.extractionTaskNo === taskNo,
    );
    if (!entry) return notFoundZh("提取任务不存在");
    const body = (await request.json()) as {
      fields?: Record<string, { value?: string | null }>;
    };
    const edits = body.fields ?? {};
    updateClaimEntry(entry.claim.id, (e) => {
      const next = { ...(e.claim.final_field_values ?? {}) };
      for (const [code, field] of Object.entries(edits)) {
        next[code] = field?.value ?? null;
      }
      e.claim.final_field_values = next;
    });
    const display_fields = Object.fromEntries(
      Object.entries(edits).map(([code, field]) => [
        code,
        {
          value: field?.value ?? null,
          status: "edited",
          confidence: 1,
          validation_error: null,
        },
      ]),
    );
    return HttpResponse.json({
      task_id: taskNo,
      status: "REVIEW",
      review: {
        task_id: taskNo,
        display_fields,
        standard_fields: display_fields,
        template_specific_field_codes: [],
        field_labels: null,
        is_confirmed: false,
      },
    });
  }),

  // --- extract (contract; ai-degrade -> 503 force_manual) ----------------------
  http.post(`${API}/doctor/claims/:claimId/extract`, async ({ request, params }) => {
    const { scenario, deny } = await gate(request);
    if (deny) return deny;
    if (isAiDegraded(scenario)) return aiUnavailable();
    if (!scopedEntry(Number(params.claimId))) return notFoundZh(CLAIM_NOT_FOUND);
    const updated = updateClaimEntry(Number(params.claimId), fillFromExtraction);
    return HttpResponse.json(updated!.claim);
  }),

  // --- submit record + trigger AI (contract) -----------------------------------
  http.put(`${API}/doctor/claims/:claimId/medical-record`, async ({ request, params }) => {
    const { scenario, deny } = await gate(request);
    if (deny) return deny;
    const body = (await request.json()) as MedicalRecordSubmit;
    if (!scopedEntry(Number(params.claimId))) return notFoundZh(CLAIM_NOT_FOUND);
    if (isAiDegraded(scenario)) {
      // Degrade: record the intake, keep the claim manual, surface 503.
      updateClaimEntry(Number(params.claimId), (entry) => {
        entry.intakeText = body.medical_record_text;
        if (body.patient_name) entry.claim.patient_name = body.patient_name;
      });
      return aiUnavailable();
    }
    const updated = updateClaimEntry(Number(params.claimId), (entry) => {
      entry.intakeText = body.medical_record_text;
      if (body.patient_name) entry.claim.patient_name = body.patient_name;
      fillFromExtraction(entry);
    });
    return HttpResponse.json(updated!.claim);
  }),

  // --- field edits + confirmation set + optimistic lock (contract) -------------
  // The client round-trips `row_version` (declared FieldsUpdate extension); a
  // stale version returns the 409 CONFLICT outcome, mirroring the backend's
  // template-field row_version contract.
  http.put(`${API}/doctor/claims/:claimId/fields`, async ({ request, params }) => {
    const { scenario, deny } = await gate(request);
    if (deny) return deny;
    const body = (await request.json()) as FieldsUpdate;
    const entry = scopedEntry(Number(params.claimId));
    if (!entry) return notFoundZh(CLAIM_NOT_FOUND);
    if (isConflict(scenario)) return conflictZh();
    if (body.row_version !== undefined && body.row_version !== entry.rowVersion) {
      return conflictZh();
    }
    const updated = updateClaimEntry(Number(params.claimId), (e) => {
      e.claim.final_field_values = {
        ...(e.claim.final_field_values ?? {}),
        ...body.final_field_values,
      };
      const values = e.claim.final_field_values ?? {};
      const cn =
        typeof values.patient_name_cn === "string" ? values.patient_name_cn.trim() : "";
      const en =
        typeof values.patient_name_en === "string" ? values.patient_name_en.trim() : "";
      const claimExt = e.claim as ClaimOut & {
        patient_name_cn?: string | null;
        patient_name_en?: string | null;
      };
      claimExt.patient_name_cn = cn || null;
      claimExt.patient_name_en = en || null;
      e.claim.patient_name = cn && en ? `${cn} / ${en}` : cn || en || e.claim.patient_name;
      if (body.confirmed) e.confirmed = { ...e.confirmed, ...body.confirmed };
    });
    return HttpResponse.json(updated!.claim);
  }),

  // --- confirm (contract; 422 when required fields unconfirmed) -----------------
  http.post(`${API}/doctor/claims/:claimId/confirm`, async ({ request, params }) => {
    const { scenario, deny } = await gate(request);
    if (deny) return deny;
    if (isConflict(scenario)) return conflictZh();
    const entry = scopedEntry(Number(params.claimId));
    if (!entry) return notFoundZh(CLAIM_NOT_FOUND);
    const schema = getTemplateFieldSchema(entry.claim.template_id);
    const values = entry.claim.final_field_values ?? {};
    const missing = schema.fields.filter((f) => {
      const value = values[f.field_code];
      const hasValue = value !== undefined && value !== null && value !== "";
      return f.required && (!hasValue || !entry.confirmed[f.field_code]);
    });
    if (missing.length > 0) {
      return errorEnvelope("VALIDATION_ERROR", `尚有 ${missing.length} 個必填欄位未核對`, 422);
    }
    const updated = updateClaimEntry(Number(params.claimId), (e) => {
      e.claim.status = "CONFIRMED";
    });
    return HttpResponse.json(updated!.claim);
  }),

  // --- generate PDF (contract) ---------------------------------------------------
  http.post(`${API}/doctor/claims/:claimId/generate-pdf`, async ({ request, params }) => {
    const { deny } = await gate(request);
    if (deny) return deny;
    const entry = scopedEntry(Number(params.claimId));
    if (!entry) return notFoundZh(CLAIM_NOT_FOUND);
    // One-off demo flag kept for the review surface: the self-verification gate
    // routing the produce step back to review.
    const url = new URL(request.url);
    if (url.searchParams.get("scenario") === "self-verification-blocked") {
      return errorEnvelope("APP_ERROR", "自我驗證未能通過，已暫停交付。", 400);
    }
    const pdfUrl = `/local-storage/generated/${entry.claim.submission_no}.pdf`;
    updateClaimEntry(Number(params.claimId), (e) => {
      e.claim.generated_pdf_url = pdfUrl;
    });
    return HttpResponse.json({ pdf_url: pdfUrl, generated_at: new Date().toISOString() });
  }),

  // --- mark printed / cancel (contract) -------------------------------------------
  http.post(`${API}/doctor/claims/:claimId/mark-printed`, async ({ request, params }) => {
    const { deny } = await gate(request);
    if (deny) return deny;
    if (!scopedEntry(Number(params.claimId))) return notFoundZh(CLAIM_NOT_FOUND);
    const updated = updateClaimEntry(Number(params.claimId), (e) => {
      e.claim.status = "PRINTED";
    });
    return HttpResponse.json(updated!.claim);
  }),

  http.post(`${API}/doctor/claims/:claimId/cancel`, async ({ request, params }) => {
    const { deny } = await gate(request);
    if (deny) return deny;
    if (!scopedEntry(Number(params.claimId))) return notFoundZh(CLAIM_NOT_FOUND);
    const updated = updateClaimEntry(Number(params.claimId), (e) => {
      e.claim.status = "CANCELLED";
    });
    return HttpResponse.json(updated!.claim);
  }),

  // --- reuse for another template (contract) ---------------------------------------
  http.post(`${API}/doctor/claims/:claimId/reuse-for-template`, async ({ request, params }) => {
    const { deny } = await gate(request);
    if (deny) return deny;
    const source = scopedEntry(Number(params.claimId));
    if (!source) return notFoundZh(CLAIM_NOT_FOUND);
    const body = (await request.json()) as ReuseRequest;
    const targetSchema = getTemplateFieldSchema(body.new_template_id);
    const sourceValues = source.claim.final_field_values ?? {};
    const prefilled: Record<string, string> = {};
    const missing: string[] = [];
    for (const field of targetSchema.fields) {
      const value = sourceValues[field.field_code];
      if (typeof value === "string" && value !== "") {
        prefilled[field.field_code] = value;
      } else if (field.required) {
        missing.push(field.field_code);
      }
    }
    const entry = createClaimEntry(source.claim.company_id, body.new_template_id, {
      // Reuse stays in the source claim's clinic — the new form is for the
      // same patient/visit context, not the merged session's primary.
      clinicId: source.claim.clinic_id,
      doctorId: sessionDoctorId,
    });
    updateClaimEntry(entry.claim.id, (e) => {
      e.claim.patient_name = source.claim.patient_name;
      e.claim.final_field_values = { ...prefilled };
    });
    return HttpResponse.json({
      submission_id: entry.claim.id,
      prefilled_fields: prefilled,
      missing_fields: missing,
    });
  }),

  // --- ad-hoc AI extraction (contract) ----------------------------------------------
  http.post(`${API}/doctor/ai/extract`, async ({ request }) => {
    const { scenario, deny } = await gate(request);
    if (deny) return deny;
    if (isAiDegraded(scenario)) return aiUnavailable();
    const body = (await request.json()) as ExtractRequest;
    const result = extractionResult(body.template_id);
    const response: ExtractResponse = {
      extracted_fields: result.ai_raw_result,
      process_time_ms: 1830,
      token_usage: 412,
    };
    return HttpResponse.json(response);
  }),

  // --- frontend-only: coverage registry ------------------------------------------
  http.get(`${API}/doctor/coverage-registry`, async ({ request }) => {
    const { scenario, deny } = await gate(request);
    if (deny) return deny;
    return HttpResponse.json(listItems(scenario, coverageRegistry));
  }),

  // --- frontend-only: document inbox (virtual-printer captures) --------------------
  http.get(`${API}/doctor/document-inbox`, async ({ request }) => {
    const { scenario, deny } = await gate(request);
    if (deny) return deny;
    return HttpResponse.json(listItems(scenario, frontendOnlyState().inboxDocuments));
  }),

  http.get(`${API}/doctor/print-captures`, async ({ request }) => {
    const { scenario, deny } = await gate(request);
    if (deny) return deny;
    return HttpResponse.json(listItems(scenario, frontendOnlyState().inboxDocuments));
  }),

  http.post(`${API}/doctor/document-inbox/:documentId/import`, async ({ request, params }) => {
    const { deny } = await gate(request);
    if (deny) return deny;
    const doc = frontendOnlyState().inboxDocuments.find((d) => d.id === params.documentId);
    if (!doc) return notFoundZh("文件不存在");
    doc.status = "imported";
    const sample = Object.values(intakeRecords)[0] ?? "";
    return HttpResponse.json({ document_id: doc.id, intake_text: sample });
  }),

  // --- frontend-only: claim extensions (intake text + permanent delete) -------------
  http.get(`${API}/doctor/claims/:claimId/intake-text`, async ({ request, params }) => {
    const { deny } = await gate(request);
    if (deny) return deny;
    const entry = scopedEntry(Number(params.claimId));
    if (!entry) return notFoundZh(CLAIM_NOT_FOUND);
    return HttpResponse.json({
      intake_text: entry.intakeText,
      confirmed: entry.confirmed,
      row_version: entry.rowVersion,
    });
  }),

  http.delete(`${API}/doctor/claims/:claimId`, async ({ request, params }) => {
    const { deny } = await gate(request);
    if (deny) return deny;
    if (!scopedEntry(Number(params.claimId))) return notFoundZh(CLAIM_NOT_FOUND);
    deleteClaimEntry(Number(params.claimId));
    return new HttpResponse(null, { status: 204 });
  }),

  // --- frontend-only: staff hand-off ------------------------------------------------
  http.get(`${API}/doctor/handoffs`, async ({ request }) => {
    const { scenario, deny } = await gate(request);
    if (deny) return deny;
    return HttpResponse.json(listItems(scenario, frontendOnlyState().handoffs));
  }),

  http.post(`${API}/doctor/claims/:claimId/handoff`, async ({ request, params }) => {
    const { deny } = await gate(request);
    if (deny) return deny;
    if (!scopedEntry(Number(params.claimId))) return notFoundZh(CLAIM_NOT_FOUND);
    const body = (await request.json().catch(() => ({}))) as HandoffCreate;
    const handoff: StaffHandoff = {
      id: nextFrontendOnlyId("ho"),
      claim_id: Number(params.claimId),
      prepared_by: "Nurse Lam 林姑娘",
      note_zh: body.note_zh ?? "",
      note_en: body.note_en ?? "",
      created_at: new Date().toISOString(),
      status: "pending",
    };
    frontendOnlyState().handoffs.unshift(handoff);
    return HttpResponse.json(handoff);
  }),

  http.post(`${API}/doctor/handoffs/:handoffId/accept`, async ({ request, params }) => {
    const { deny } = await gate(request);
    if (deny) return deny;
    const handoff = frontendOnlyState().handoffs.find((h) => h.id === params.handoffId);
    if (!handoff) return notFoundZh("交辦記錄不存在");
    handoff.status = "accepted";
    return HttpResponse.json(handoff);
  }),

  // --- frontend-only: doctor settings ------------------------------------------------
  http.get(`${API}/doctor/settings`, async ({ request }) => {
    const { deny } = await gate(request);
    if (deny) return deny;
    return HttpResponse.json(frontendOnlyState().settings);
  }),

  http.put(`${API}/doctor/settings`, async ({ request }) => {
    const { deny } = await gate(request);
    if (deny) return deny;
    const body = (await request.json()) as DoctorSettingsUpdate;
    const settings = frontendOnlyState().settings;
    if (body.signature_image_url !== undefined) settings.signature_image_url = body.signature_image_url;
    if (body.language !== undefined) settings.language = body.language;
    if (body.idle_lock_minutes !== undefined) settings.idle_lock_minutes = body.idle_lock_minutes;
    if (body.delivery_default !== undefined) settings.delivery_default = body.delivery_default;
    if (body.remove_device_ids?.length) {
      settings.trusted_devices = settings.trusted_devices.filter(
        (d) => !body.remove_device_ids?.includes(d.id),
      );
    }
    return HttpResponse.json(settings);
  }),

  // --- frontend-only: notifications (paged from day one — unbounded list) ---------------
  http.get(`${API}/doctor/notifications`, async ({ request }) => {
    const { scenario, deny } = await gate(request);
    if (deny) return deny;
    const { pageNo, pageSize } = pageQuery(request);
    return HttpResponse.json(
      page(listItems(scenario, frontendOnlyState().notifications), pageNo, pageSize),
    );
  }),

  http.post(`${API}/doctor/notifications/read-all`, async ({ request }) => {
    const { deny } = await gate(request);
    if (deny) return deny;
    for (const n of frontendOnlyState().notifications) n.read = true;
    return HttpResponse.json({ success: true });
  }),

  http.post(`${API}/doctor/notifications/:notificationId/read`, async ({ request, params }) => {
    const { deny } = await gate(request);
    if (deny) return deny;
    const item = frontendOnlyState().notifications.find((n) => n.id === params.notificationId);
    if (!item) return notFoundZh("通知不存在");
    item.read = true;
    return HttpResponse.json(item);
  }),

  // --- frontend-only: support access (doctor-side grants) --------------------------------
  http.get(`${API}/doctor/support-access`, async ({ request }) => {
    const { deny } = await gate(request);
    if (deny) return deny;
    return HttpResponse.json(frontendOnlyState().supportAccess);
  }),

  http.post(`${API}/doctor/support-access/grant`, async ({ request }) => {
    const { deny } = await gate(request);
    if (deny) return deny;
    const body = (await request.json()) as SupportAccessGrantRequest;
    const now = Date.now();
    const grant: SupportAccessGrant = {
      id: nextFrontendOnlyId("sa"),
      operator: "Acuity support",
      mode: body.mode,
      started_at: new Date(now).toISOString(),
      expires_at: new Date(now + (body.duration_minutes ?? 60) * 60_000).toISOString(),
      status: "active",
    };
    const state = frontendOnlyState().supportAccess;
    state.grants.unshift(grant);
    state.active = true;
    return HttpResponse.json(grant);
  }),

  http.post(`${API}/doctor/support-access/revoke`, async ({ request }) => {
    const { deny } = await gate(request);
    if (deny) return deny;
    const body = (await request.json().catch(() => ({}))) as { grant_id?: string };
    const state = frontendOnlyState().supportAccess;
    const grant = state.grants.find((g) => g.id === body.grant_id);
    if (!grant) return notFoundZh("授權記錄不存在");
    grant.status = "revoked";
    state.active = state.grants.some((g) => g.status === "active");
    return HttpResponse.json({ success: true });
  }),
];
