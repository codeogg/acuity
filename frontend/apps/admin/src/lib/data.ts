// Console data seam — every screen reads the backend contract through the
// shared typed endpoints in @acuity/api-client. In mock-first mode those
// fetches are intercepted node-side by the package's MSW handler set (started
// in src/instrumentation.ts) over one stateful fixture universe; in live mode
// the same calls hit the real /api/* backend (NEXT_PUBLIC_API_BASE). This
// module adds only console-side composition: the ops-model join (mock-first
// operational fields pending backend support) and list shaping (saved-view
// tabs, sort, keyword) that belongs to the presentation, not to the contract.

import {
  api,
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
  ClinicConfigOverview,
  ClinicOut,
  DoctorOut,
  Page,
  TemplateOut,
} from "@acuity/types";
import {
  type ClinicOps,
  type DoctorOps,
  type TemplateOps,
  type TemplateOpsStatus,
  clinicOps,
  doctorOps,
  intakeStatuses,
  templateOps,
  templateOpsStatus,
} from "./ops-model";
import { compareBy, type SortState } from "./table";

const {
  adminAnalytics,
  adminAudit,
  adminClaimsOversight,
  adminImpersonation,
  adminSavedViews,
  adminTags,
  adminTickets,
} = frontendOnly;

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
export const listAuditEvents = adminAudit.listAuditEvents;
export const listTickets = adminTickets.listTickets;
export const getTicket = adminTickets.getTicket;
export const listOnboardingQueue = adminTickets.listOnboardingQueue;
export const listTags = adminTags.listTags;
export const getTagVisibility = adminTags.getTagVisibility;
export const getAnalyticsOverview = adminAnalytics.getAnalyticsOverview;
export const getUsageSeries = adminAnalytics.getUsageSeries;
export const getActivationFunnel = adminAnalytics.getActivationFunnel;
export const getVerificationReport = adminAnalytics.getVerificationReport;
export const getQualityReport = adminAnalytics.getQualityReport;
export const listSavedViews = adminSavedViews.listSavedViews;
export const getImpersonationSession = adminImpersonation.getImpersonationSession;
export const listClaimsOversight = adminClaimsOversight.listClaimsOversight;
export const getClaimOversight = adminClaimsOversight.getClaimOversight;
export const listClaimsContract = claimsContract.listClaims;

export type AuditEvent = Awaited<ReturnType<typeof adminAudit.listAuditEvents>>["items"][number];

// --- account-model normalisers (dev ADR 0041) -----------------------------------
// The account fields ride DoctorOut/ClinicOut as mock-first body extensions;
// absent fields carry the ADR defaults (primary link only, separated
// workspaces, MFA off, empty notes).

export function doctorAccount(doctor: DoctorOut): DoctorAccountOut {
  const ext = doctor as DoctorOut & Partial<DoctorAccountExtension>;
  return {
    ...doctor,
    clinic_ids: Array.isArray(ext.clinic_ids)
      ? ext.clinic_ids
      : doctor.clinic_id != null
        ? [doctor.clinic_id]
        : [],
    notes: typeof ext.notes === "string" ? ext.notes : "",
    workspace_separation: ext.workspace_separation ?? "separated",
    mfa_enabled: ext.mfa_enabled ?? false,
  };
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

export async function listClinicRows(keyword?: string): Promise<ClinicRow[]> {
  const headers = await serverSessionHeaders();
  const [clinicPage, doctorPage] = await Promise.all([
    api.get<Awaited<ReturnType<typeof clinics.listClinics>>>("/admin/clinics", {
      query: { keyword, page_size: PAGE_ALL },
      headers,
    }),
    api.get<Awaited<ReturnType<typeof doctors.listDoctors>>>("/admin/doctors", {
      query: { page_size: PAGE_ALL },
      headers,
    }),
  ]);
  return clinicPage.items.map((clinic) => ({
    clinic,
    ops: clinicOps(clinic),
    doctor_count: doctorPage.items.filter((d) => d.clinic_id === clinic.id).length,
  }));
}

export type ClinicTab = "needs-attention" | "provisioning" | "active" | "overdue" | "all";
export const CLINIC_TABS: ClinicTab[] = ["needs-attention", "provisioning", "active", "overdue", "all"];

export function clinicMatchesTab(row: ClinicRow, tab: ClinicTab): boolean {
  if (tab === "all") return true;
  if (tab === "overdue") return row.ops.payment === "overdue";
  return row.ops.ops_status === tab;
}

export function sortClinicRows(rows: ClinicRow[], sort: SortState | null, needsFirst: boolean): ClinicRow[] {
  const sorted = sort
    ? [...rows].sort(
        compareBy<ClinicRow>((r) => {
          switch (sort.key) {
            case "name":
              return r.clinic.clinic_name_en ?? r.clinic.clinic_name;
            case "status":
              return r.ops.ops_status;
            case "doctors":
              return r.doctor_count;
            case "last":
              return r.ops.last_activity;
            case "payment":
              return r.ops.payment;
            default:
              return r.clinic.clinic_code;
          }
        }, sort.direction),
      )
    : rows;
  if (!needsFirst || sort) return sorted;
  // Default order surfaces needs-attention rows first (reference priority sort).
  return [...sorted].sort(
    (a, b) => Number(b.ops.ops_status === "needs-attention") - Number(a.ops.ops_status === "needs-attention"),
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
  return doctorPage.items.map((raw) => {
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
}

export type DoctorTab = "mfa-pending" | "active" | "all";
export const DOCTOR_TABS: DoctorTab[] = ["mfa-pending", "active", "all"];

export function doctorMatchesTab(row: DoctorRow, tab: DoctorTab): boolean {
  if (tab === "all") return true;
  if (tab === "mfa-pending") return row.ops.mfa !== "enrolled";
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
        case "mfa":
          return r.ops.mfa;
        case "last":
          return r.ops.last_activity;
        default:
          return r.doctor.login_account;
      }
    }, sort.direction),
  );
}

export type FormsTab = "intake" | "library" | "failed" | "all";
export const FORMS_TABS: FormsTab[] = ["intake", "library", "failed", "all"];

export function templateMatchesTab(row: TemplateRow, tab: FormsTab): boolean {
  if (tab === "all") return true;
  if (tab === "intake") return intakeStatuses().includes(row.ops_status);
  if (tab === "library") return row.ops_status === "confirmed";
  return row.ops_status === "failed";
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
    adminTickets.listTickets({ page_size: PAGE_ALL }),
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
      href: `/forms?tab=failed`,
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
    adminTickets.listTickets({ page_size: PAGE_ALL }),
    listTemplateRows(),
  ]);
  return {
    clinics: clinicPage.total,
    doctors: doctorPage.total,
    tickets: ticketPage.items.filter((t) => t.status !== "resolved").length,
    forms: templateRows.filter((r) => templateMatchesTab(r, "intake")).length,
  };
}
