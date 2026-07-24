// Console data seam — every screen reads the backend contract through the
// shared typed endpoints in @acuity/api-client. In mock-first mode those
// fetches are intercepted node-side by the package's MSW handler set (started
// in src/instrumentation.ts) over one stateful fixture universe; in live mode
// the same calls hit the real /api/* backend (NEXT_PUBLIC_API_BASE). This
// module adds only console-side composition: the ops-model join (mock-first
// operational fields pending backend support) and list shaping (saved-view
// tabs, sort, keyword) that belongs to the presentation, not to the contract.

import {
  ApiError,
  api,
  audit,
  claims as claimsContract,
  clinics,
  companies,
  doctors,
  fields,
  frontendOnly,
  templates,
} from "@acuity/api-client";
import { cookies } from "next/headers";
import type {
  ClinicAccountOut,
  DoctorAccountExtension,
  DoctorAccountOut,
} from "@acuity/api-client";
import type {
  ActivationFunnel,
  AnalyticsOverview,
  AuditLogOut,
  ClinicConfigOverview,
  ClinicOut,
  ClinicRetentionAuditOut,
  ClinicRetentionOut,
  ClinicSubscriptionOut,
  DoctorOut,
  OnboardingQueueItem,
  Page,
  QualityReport,
  Tag,
  TagVisibilityEntry,
  TemplateOut,
  Ticket,
  UsagePoint,
  VerificationReport,
} from "@acuity/types";
import {
  type ClinicOps,
  type DoctorOps,
  type TemplateOps,
  type TemplateOpsStatus,
  clinicOps,
  doctorOps,
  templateOps,
  templateOpsStatus,
} from "./ops-model";
import { compareBy, type SortState } from "./table";

const {
  adminAnalytics,
  adminClaimsOversight,
  adminImpersonation,
  adminSavedViews,
  adminTags,
  adminTickets,
} = frontendOnly;

// Live FastAPI does not implement most forward-contract / frontend-only admin
// surfaces yet (impersonation, saved-views). Soft-fail those reads to empty
// defaults so the console shell stays usable. Tickets, onboarding-queue,
// claims oversight, analytics, tags and audit-logs are implemented on the live API.
function emptyPage<T>(pageSize = 100): Page<T> {
  return { items: [], total: 0, page: 1, page_size: pageSize };
}

async function softFrontendOnly<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (
      err instanceof ApiError &&
      (err.kind === "not_found" || err.kind === "network" || err.status === 404)
    ) {
      return fallback;
    }
    throw err;
  }
}

// Contract reads, re-exported as the single import home for pages. Server
// Components call the Next.js proxy from Node, so forward the incoming cookie
// explicitly; browser-side fetches include it automatically.
export async function listClinics(
  query: Parameters<typeof clinics.listClinics>[0] = {},
): Promise<Page<ClinicOut>> {
  return api.get<Page<ClinicOut>>("/admin/clinics", {
    query,
    headers: await serverSessionHeaders(),
  });
}

export async function getClinic(clinicId: number): Promise<ClinicOut> {
  return api.get<ClinicOut>(`/admin/clinics/${clinicId}`, {
    headers: await serverSessionHeaders(),
  });
}

export async function getClinicInsurers(clinicId: number): Promise<number[]> {
  return api.get<number[]>(`/admin/clinics/${clinicId}/insurance-companies`, {
    headers: await serverSessionHeaders(),
  });
}

export async function getClinicConfigOverview(
  clinicId: number,
): Promise<ClinicConfigOverview> {
  return api.get<ClinicConfigOverview>(`/admin/clinics/${clinicId}/config-overview`, {
    headers: await serverSessionHeaders(),
  });
}

export async function getClinicSubscription(
  clinicId: number,
): Promise<ClinicSubscriptionOut> {
  return api.get<ClinicSubscriptionOut>(`/admin/clinics/${clinicId}/subscription`, {
    headers: await serverSessionHeaders(),
  });
}

export async function getClinicRetention(
  clinicId: number,
): Promise<ClinicRetentionOut> {
  return api.get<ClinicRetentionOut>(`/admin/clinics/${clinicId}/retention`, {
    headers: await serverSessionHeaders(),
  });
}

export async function listClinicRetentionHistory(
  clinicId: number,
): Promise<ClinicRetentionAuditOut[]> {
  return api.get<ClinicRetentionAuditOut[]>(
    `/admin/clinics/${clinicId}/retention/history`,
    { headers: await serverSessionHeaders() },
  );
}
export async function getDoctor(doctorId: number): Promise<DoctorOut> {
  return api.get<DoctorOut>(`/admin/doctors/${doctorId}`, {
    headers: await serverSessionHeaders(),
  });
}
export const listCompanies = companies.listCompanies;
export const getCompany = companies.getCompany;
export const listDomains = fields.listDomains;
export const listStandardFields = fields.listStandardFields;
export const listTransformRules = fields.listTransformRules;
export const getTemplate = templates.getTemplate;
export const listTemplateFields = templates.listTemplateFields;
export const getParseProgress = templates.getParseProgress;
export const getPublishPreview = templates.getPublishPreview;
export async function listAuditLogs(
  query: {
    page?: number;
    page_size?: number;
    scope?: "global" | "clinic";
    operator_id?: number;
    action_type?: string;
    clinic_id?: number;
  } = {},
): Promise<Page<AuditLogOut>> {
  return audit.listAuditLogs(query, { headers: await serverSessionHeaders() });
}

export async function getAuditLog(eventCode: string): Promise<AuditLogOut> {
  return audit.getAuditLog(eventCode, { headers: await serverSessionHeaders() });
}
export async function listTickets(
  query: Parameters<typeof adminTickets.listTickets>[0] = {},
): Promise<Page<Ticket>> {
  return adminTickets.listTickets(query, { headers: await serverSessionHeaders() });
}
export async function getTicket(ticketId: string): Promise<Ticket> {
  return adminTickets.getTicket(ticketId, { headers: await serverSessionHeaders() });
}
export async function listOnboardingQueue(): Promise<OnboardingQueueItem[]> {
  return adminTickets.listOnboardingQueue({ headers: await serverSessionHeaders() });
}
export async function listTags(
  kind?: Parameters<typeof adminTags.listTags>[0],
): Promise<Tag[]> {
  return api.get<Tag[]>("/admin/tags", {
    query: kind ? { kind } : undefined,
    headers: await serverSessionHeaders(),
  });
}
export async function getTagVisibility(
  doctorId?: Parameters<typeof adminTags.getTagVisibility>[0],
): Promise<TagVisibilityEntry[]> {
  return api.get<TagVisibilityEntry[]>("/admin/tags/visibility", {
    query: doctorId === undefined ? undefined : { doctor_id: doctorId },
    headers: await serverSessionHeaders(),
  });
}
export async function getAnalyticsOverview(): Promise<AnalyticsOverview> {
  return adminAnalytics.getAnalyticsOverview({
    headers: await serverSessionHeaders(),
  });
}
export async function getUsageSeries(
  query: Parameters<typeof adminAnalytics.getUsageSeries>[0] = {},
): Promise<UsagePoint[]> {
  return adminAnalytics.getUsageSeries(query, {
    headers: await serverSessionHeaders(),
  });
}
export async function getActivationFunnel(): Promise<ActivationFunnel> {
  return adminAnalytics.getActivationFunnel({
    headers: await serverSessionHeaders(),
  });
}
export async function getVerificationReport(): Promise<VerificationReport> {
  return adminAnalytics.getVerificationReport({
    headers: await serverSessionHeaders(),
  });
}
export async function getQualityReport(): Promise<QualityReport> {
  return adminAnalytics.getQualityReport({
    headers: await serverSessionHeaders(),
  });
}
export const listSavedViews = adminSavedViews.listSavedViews;
export function getImpersonationSession(): Promise<
  Awaited<ReturnType<typeof adminImpersonation.getImpersonationSession>>
> {
  return softFrontendOnly(() => adminImpersonation.getImpersonationSession(), {
    active: null,
  });
}
export async function listClaimsOversight(
  query: Parameters<typeof adminClaimsOversight.listClaimsOversight>[0] = {},
): Promise<Awaited<ReturnType<typeof adminClaimsOversight.listClaimsOversight>>> {
  return adminClaimsOversight.listClaimsOversight(query, {
    headers: await serverSessionHeaders(),
  });
}

export async function getClaimOversight(
  claimId: number,
): Promise<Awaited<ReturnType<typeof adminClaimsOversight.getClaimOversight>>> {
  return adminClaimsOversight.getClaimOversight(claimId, {
    headers: await serverSessionHeaders(),
  });
}
export const listClaimsContract = claimsContract.listClaims;

export type AuditLog = AuditLogOut;
/** @deprecated Prefer AuditLog */
export type AuditEvent = AuditLogOut;

// --- account-model normalisers (dev ADR 0041) -----------------------------------
// The account fields ride DoctorOut/ClinicOut as mock-first body extensions;
// absent fields carry the ADR defaults (primary link only, separated
// workspaces, MFA off, empty notes).

export function doctorAccount(doctor: DoctorOut): DoctorAccountOut {
  const ext = doctor as DoctorAccountOut;
  const notes =
    typeof ext.notes === "string"
      ? ext.notes
      : typeof doctor.account_notes === "string"
        ? doctor.account_notes
        : "";
  const notesFormat =
    ext.notes_format === "html" || ext.notes_format === "markdown"
      ? ext.notes_format
      : doctor.account_notes_format === "html"
        ? "html"
        : "markdown";
  return {
    ...doctor,
    clinic_ids: Array.isArray(ext.clinic_ids)
      ? ext.clinic_ids
      : doctor.clinic_id != null
        ? [doctor.clinic_id]
        : [],
    notes,
    notes_format: notesFormat,
    workspace_separation: ext.workspace_separation ?? "separated",
    mfa_enabled: ext.mfa_enabled ?? false,
  };
}

/** Display label for a doctor's specialty (live API or fallback). */
export function doctorSpecialtyLabel(
  doctor: Pick<DoctorOut, "specialty_label_en" | "specialty_label_zh">,
  locale: string,
): string {
  return locale.startsWith("zh")
    ? (doctor.specialty_label_zh || "全科")
    : (doctor.specialty_label_en || "General practice");
}

export function clinicAccount(clinic: ClinicOut): ClinicAccountOut {
  const ext = clinic as ClinicOut & { notes?: unknown };
  return { ...clinic, notes: typeof ext.notes === "string" ? ext.notes : "" };
}

// --- joined list shapes ---------------------------------------------------------

export interface ClinicRow {
  clinic: ClinicOut;
  ops: ClinicOps;
  doctor_count: number;
}

export interface DoctorRow {
  doctor: DoctorAccountOut;
  ops: DoctorOps;
  /** Primary (first) linked clinic; null = individual account. */
  clinic: ClinicOut | null;
  /** All linked clinics, primary first (dev ADR 0041). */
  clinics: ClinicOut[];
}

export interface TemplateRow {
  template: TemplateOut;
  ops: TemplateOps;
  ops_status: TemplateOpsStatus;
  company_name: string;
  company_name_zh: string;
  field_count: number;
}

const PAGE_ALL = 100;

async function serverSessionHeaders(): Promise<Record<string, string>> {
  const cookie = (await cookies()).toString();
  return cookie ? { cookie } : {};
}

export const CLINIC_BACKEND_SORT_KEYS = new Set([
  "name",
  "code",
  "doctors",
  "created_at",
  "id",
]);

export async function listClinicRows(keyword?: string, sort?: string): Promise<ClinicRow[]> {
  const headers = await serverSessionHeaders();
  const [clinicPage, doctorPage] = await Promise.all([
    api.get<Awaited<ReturnType<typeof clinics.listClinics>>>("/admin/clinics", {
      query: { keyword, sort, page_size: PAGE_ALL },
      headers,
    }),
    api.get<Awaited<ReturnType<typeof doctors.listDoctors>>>("/admin/doctors", {
      query: { page_size: PAGE_ALL },
      headers,
    }),
  ]);
  // Count every doctor linked to the clinic (primary or secondary), matching
  // the drawer / GET /admin/doctors?clinic_id=… filter — not only doctor.clinic_id.
  return clinicPage.items.map((clinic) => ({
    clinic,
    ops: clinicOps(clinic),
    doctor_count: doctorPage.items.filter((d) =>
      doctorAccount(d).clinic_ids.includes(clinic.id),
    ).length,
  }));
}

export type ClinicTab =
  | "needs-attention"
  | "provisioning"
  | "onboarding"
  | "active"
  | "overdue"
  | "all";
export const CLINIC_TABS: ClinicTab[] = [
  "needs-attention",
  "provisioning",
  "onboarding",
  "active",
  "overdue",
  "all",
];

export function clinicMatchesTab(row: ClinicRow, tab: ClinicTab): boolean {
  if (tab === "all") return true;
  if (tab === "overdue") return row.ops.payment === "overdue";
  if (tab === "needs-attention") return Boolean(row.clinic.is_flagged);
  return clinicDisplayStatus(row) === tab;
}

/** Status shown in the grid badge / used by the status filter. */
export function clinicDisplayStatus(
  row: ClinicRow,
): "needs-attention" | ClinicRow["ops"]["ops_status"] {
  if (row.clinic.is_flagged) return "needs-attention";
  return row.ops.ops_status;
}

export function clinicMatchesKeyword(row: ClinicRow, keyword: string): boolean {
  const k = keyword.trim().toLowerCase();
  if (!k) return true;
  const haystack = [
    row.clinic.clinic_name,
    row.clinic.clinic_name_en,
    row.clinic.clinic_code,
    row.clinic.district_name_zh,
    row.clinic.district_name_en,
    row.ops.district_zh,
    row.ops.district_en,
  ]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
  return haystack.includes(k);
}

export function sortClinicRows(rows: ClinicRow[], sort: SortState | null, needsFirst: boolean): ClinicRow[] {
  const sorted = sort
    ? [...rows].sort(
        compareBy<ClinicRow>((r) => {
          switch (sort.key) {
            case "status":
              return r.ops.ops_status;
            case "last":
              return r.ops.last_activity;
            case "payment":
              return r.ops.payment;
            default:
              return null;
          }
        }, sort.direction),
      )
    : rows;
  if (!needsFirst || sort) return sorted;
  // Default order surfaces flagged (needs-attention) rows first.
  return [...sorted].sort(
    (a, b) => Number(Boolean(b.clinic.is_flagged)) - Number(Boolean(a.clinic.is_flagged)),
  );
}

export type DoctorLinked = "clinic" | "individual";

export async function listDoctorRows(
  keyword?: string,
  clinicId?: number,
  linked?: DoctorLinked,
): Promise<DoctorRow[]> {
  const [doctorPage, clinicPage] = await Promise.all([
    api.get<Awaited<ReturnType<typeof doctors.listDoctors>>>("/admin/doctors", {
      query: { keyword, clinic_id: clinicId, linked, page_size: PAGE_ALL },
      headers: await serverSessionHeaders(),
    }),
    listClinics({ page_size: PAGE_ALL }),
  ]);
  const rows = doctorPage.items.map((raw) => {
    const doctor = doctorAccount(raw);
    const linkedClinics = doctor.clinic_ids
      .map((id) => clinicPage.items.find((c) => c.id === id))
      .filter((c): c is ClinicOut => Boolean(c));
    return {
      doctor,
      ops: doctorOps(doctor),
      clinic: linkedClinics[0] ?? null,
      clinics: linkedClinics,
    };
  });
  // Defensive client filter: older backends may ignore `linked`.
  if (linked === "clinic") return rows.filter((r) => r.clinics.length > 0);
  if (linked === "individual") return rows.filter((r) => r.clinics.length === 0);
  return rows;
}

export type DoctorTab = "active" | "all";
export const DOCTOR_TABS: DoctorTab[] = ["active", "all"];

export function doctorMatchesTab(row: DoctorRow, tab: DoctorTab): boolean {
  if (tab === "all") return true;
  return row.ops.activation === "active";
}

export function sortDoctorRows(rows: DoctorRow[], sort: SortState | null): DoctorRow[] {
  if (!sort) return rows;
  return [...rows].sort(
    compareBy<DoctorRow>((r) => {
      switch (sort.key) {
        case "name":
          return r.doctor.doctor_name_en ?? r.doctor.doctor_name;
        case "doctor":
          return r.doctor.login_account;
        case "clinic":
          return r.clinic?.clinic_name_en ?? r.clinic?.clinic_name ?? "";
        case "last":
          return r.ops.last_activity;
        default:
          return r.doctor.login_account;
      }
    }, sort.direction),
  );
}

export type FormsTab = "intake" | "library" | "all";
export const FORMS_TABS: FormsTab[] = ["intake", "library", "all"];

export function templateMatchesTab(row: TemplateRow, tab: FormsTab): boolean {
  if (tab === "all") return true;
  if (tab === "library") return row.ops_status === "confirmed";
  // Intake: in-flight pipeline work — excludes published (library) and failed parses.
  return row.ops_status !== "confirmed" && row.ops_status !== "failed";
}

export async function listTemplateRows(keyword?: string): Promise<TemplateRow[]> {
  const [templateList, companyPage] = await Promise.all([
    templates.listTemplates(),
    companies.listCompanies({ page_size: PAGE_ALL }),
  ]);
  const rows = await Promise.all(
    templateList.map(async (template) => {
      let fieldCount = 0;
      try {
        fieldCount = (await templates.listTemplateFields(template.id)).length;
      } catch {
        fieldCount = 0;
      }
      const company = companyPage.items.find((c) => c.id === template.company_id);
      return {
        template,
        ops: templateOps(template),
        ops_status: templateOpsStatus(template),
        company_name: company?.company_name_en ?? company?.company_name ?? "—",
        company_name_zh: company?.company_name ?? company?.company_name_en ?? "—",
        field_count: fieldCount,
      };
    }),
  );
  if (!keyword) return rows;
  const k = keyword.toLowerCase();
  return rows.filter((r) =>
    [r.template.template_name, r.template.template_code, r.company_name].some((v) =>
      v.toLowerCase().includes(k),
    ),
  );
}

export function sortTemplateRows(rows: TemplateRow[], sort: SortState | null): TemplateRow[] {
  if (!sort) return rows;
  return [...rows].sort(
    compareBy<TemplateRow>((r) => {
      switch (sort.key) {
        case "name":
          return r.template.template_name;
        case "status":
          return r.ops_status;
        case "fields":
          return r.field_count;
        case "uploaded":
          return r.template.created_at;
        case "usage":
          return r.ops.usage_count;
        default:
          return r.template.template_code;
      }
    }, sort.direction),
  );
}

// --- dashboard ---------------------------------------------------------------

export interface DashboardGlance {
  active_clinics: number;
  funnel: { provisioning: number; onboarding: number; active: number };
  awaiting_confirmation: number;
}

export async function getDashboardGlance(): Promise<DashboardGlance> {
  const [clinicRows, templateList] = await Promise.all([listClinicRows(), templates.listTemplates()]);
  const byStatus = (s: string) => clinicRows.filter((r) => r.ops.ops_status === s).length;
  return {
    active_clinics: byStatus("active") + byStatus("needs-attention"),
    funnel: {
      provisioning: byStatus("provisioning"),
      onboarding: byStatus("onboarding"),
      active: byStatus("active") + byStatus("needs-attention"),
    },
    awaiting_confirmation: templateList.filter((t) =>
      ["AUTO_PARSED", "AI_ASSISTED", "ANNOTATED"].includes(t.parse_status),
    ).length,
  };
}

export interface WorklistItem {
  kind: "clinic" | "payment" | "extraction" | "ticket" | "template";
  status_key: string;
  label_key: string;
  label_args?: Record<string, string | number>;
  target: string;
  href: string;
}

export async function getWorklist(): Promise<WorklistItem[]> {
  const [clinicRows, templateRows, ticketsPage] = await Promise.all([
    listClinicRows(),
    listTemplateRows(),
    listTickets({ page_size: PAGE_ALL }),
  ]);
  const items: WorklistItem[] = [];
  for (const r of clinicRows.filter((r) => r.ops.ops_status === "needs-attention")) {
    items.push({
      kind: "clinic",
      status_key: "status.needs-attention",
      label_key: "worklist.clinic-attention",
      label_args: { name: r.clinic.clinic_name_en ?? r.clinic.clinic_name },
      target: r.clinic.clinic_code,
      href: `/clinics?open=${r.clinic.id}`,
    });
  }
  for (const r of clinicRows.filter((r) => r.ops.payment === "overdue")) {
    items.push({
      kind: "payment",
      status_key: "status.overdue",
      label_key: "worklist.payment-overdue",
      label_args: { name: r.clinic.clinic_name_en ?? r.clinic.clinic_name },
      target: r.clinic.clinic_code,
      href: `/clinics?open=${r.clinic.id}&facet=account`,
    });
  }
  for (const r of templateRows.filter(
    (r) => r.ops.confidence != null && r.ops.confidence < 0.85 && templateMatchesTab(r, "intake"),
  )) {
    items.push({
      kind: "extraction",
      status_key: "status.confidence-low",
      label_key: "worklist.low-confidence",
      label_args: {
        name: r.template.template_name,
        pct: Math.round((r.ops.confidence ?? 0) * 100),
      },
      target: r.template.template_code,
      href: `/forms/${r.template.id}`,
    });
  }
  for (const r of templateRows.filter((r) => r.ops_status === "failed")) {
    items.push({
      kind: "template",
      status_key: "status.failed",
      label_key: "worklist.template-failed",
      label_args: { name: r.template.template_name },
      target: r.template.template_code,
      href: `/forms/${r.template.id}`,
    });
  }
  const openTickets = ticketsPage.items.filter((t) => t.status !== "resolved");
  if (openTickets.length > 0) {
    items.push({
      kind: "ticket",
      status_key: "status.open",
      label_key: "worklist.open-tickets",
      label_args: {
        count: openTickets.length,
        clinics: new Set(openTickets.map((t) => t.clinic_id)).size,
      },
      target: openTickets[0]?.id ?? "",
      href: `/tickets?tab=open`,
    });
  }
  const awaiting = templateRows.filter((r) => ["processed", "draft"].includes(r.ops_status));
  if (awaiting.length > 0) {
    items.push({
      kind: "template",
      status_key: "status.awaiting",
      label_key: "worklist.awaiting-confirmation",
      label_args: { count: awaiting.length },
      target: "intake",
      href: `/forms?tab=intake`,
    });
  }
  return items;
}

// Sidebar nav counts (clinics · doctors · open tickets · forms in intake).
export interface NavCounts {
  clinics: number;
  doctors: number;
  tickets: number;
  forms: number;
}

export async function getNavCounts(): Promise<NavCounts> {
  const [clinicPage, doctorPage, ticketPage, templateRows] = await Promise.all([
    clinics.listClinics({ page_size: PAGE_ALL }),
    doctors.listDoctors({ page_size: PAGE_ALL }),
    listTickets({ page_size: PAGE_ALL }),
    listTemplateRows(),
  ]);
  return {
    clinics: clinicPage.total,
    doctors: doctorPage.total,
    tickets: ticketPage.items.filter((t) => t.status !== "resolved").length,
    forms: templateRows.filter((r) => templateMatchesTab(r, "intake")).length,
  };
}
