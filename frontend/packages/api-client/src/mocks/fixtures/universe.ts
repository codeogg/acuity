// Typed accessor over the shared fixture universe (universe.json) — ONE
// coherent bilingual dataset every surface's mocks read from: the clinics and
// doctors the operator console lists are the clinic and doctor the doctor app
// signs in as; the claims the doctor app mutates seed the console's oversight
// view (PHI-redacted). Illustrative mock data only; no real PII.
//
// universe.json is the committed source of truth (plain JSON so the data-layer
// verify script cross-references it without a TS loader). Edit the JSON, not
// derived copies.

import type {
  ClaimListItem,
  ClaimOut,
  ClinicOut,
  CompanyBrief,
  CompanyOut,
  DoctorOut,
  DomainOut,
  HomeOverview,
  MeResponse,
  StandardFieldOut,
  TemplateBrief,
  TemplateFieldOut,
  TemplateOut,
  TransformRuleOut,
} from "@acuity/types";
import type {
  CoverageInsurer,
} from "../../endpoints/frontend-only/coverage-registry";
import type { InboxDocument } from "../../endpoints/frontend-only/document-inbox";
import type { StaffHandoff } from "../../endpoints/frontend-only/staff-handoff";
import type { DoctorSettings } from "../../endpoints/frontend-only/doctor-settings";
import type { NotificationItem } from "../../endpoints/frontend-only/notifications";
import type { SupportAccessState } from "../../endpoints/frontend-only/support-access";
import type {
  OnboardingQueueItem,
  Ticket,
} from "../../endpoints/frontend-only/admin-tickets";
import type { Tag, TagVisibilityEntry } from "../../endpoints/frontend-only/admin-tags";
import type {
  ActivationFunnel,
  AnalyticsOverview,
  QualityReport,
  UsagePoint,
  VerificationReport,
} from "../../endpoints/frontend-only/admin-analytics";
import type { SavedView } from "../../endpoints/frontend-only/admin-saved-views";
import universe from "./universe.json";

// --- core entities (contract shapes) -----------------------------------------

export const demoClinics = universe.clinics as unknown as ClinicOut[];
export const demoDoctors = universe.doctors as unknown as DoctorOut[];
export const demoCompaniesFull = universe.companies as unknown as CompanyOut[];
export const demoTemplatesAdmin = universe.templates as unknown as TemplateOut[];
export const demoTemplateFields = Object.fromEntries(
  Object.entries(universe.template_fields).map(([k, v]) => [Number(k), v]),
) as unknown as Record<number, TemplateFieldOut[]>;
export const demoDomains = universe.domains as unknown as DomainOut[];
export const demoStandardFields =
  universe.standard_fields as unknown as StandardFieldOut[];
export const demoTransformRules =
  universe.transform_rules as unknown as TransformRuleOut[];

// --- session identities --------------------------------------------------------

export const demoUser = universe.session.doctor as unknown as MeResponse;
export const operatorUser = universe.session.operator as unknown as MeResponse;
export const greetingName: string = universe.session.greeting_name;
export const clinicName: string = universe.session.clinic_name;
export const sessionClinicId: number = universe.meta.session_clinic_id;
export const sessionDoctorId: number = universe.meta.session_doctor_id;

// --- auth accounts (mock journey) ----------------------------------------------

export interface MockAuthAccount {
  login_account: string;
  password: string;
  role: string;
  user_id: number;
  display_name: string;
  clinic_ids: number[];
  mfa_method: string;
  locked: boolean;
}

export const authAccounts = universe.auth.accounts as unknown as MockAuthAccount[];
export const totpValidCode: string = universe.auth.totp_valid_code;
export const backupCode: string = universe.auth.backup_code;
export const returnTargetAllowlist: string[] = universe.auth.return_target_allowlist;

// --- coverage registry + doctor-surface catalog derivations ----------------------

export const coverageRegistry =
  universe.coverage_registry as unknown as CoverageInsurer[];

// Companies visible to the doctor surface (brief shape).
export const demoCompanies: CompanyBrief[] = coverageRegistry.map((insurer) => ({
  id: insurer.company_id,
  company_name: insurer.company_name_zh,
  company_name_en: insurer.company_name_en,
  logo_url: null,
}));

// Published templates per company (doctor-surface brief), covered forms only.
export const demoTemplatesByCompany: Record<number, TemplateBrief[]> =
  Object.fromEntries(
    coverageRegistry.map((insurer) => [
      insurer.company_id,
      insurer.forms
        .filter((form) => form.coverage === "covered")
        .map((form) => ({
          id: form.template_id,
          template_name: `${form.form_name_zh} ${form.form_name_en}`,
          version:
            demoTemplatesAdmin.find((t) => t.id === form.template_id)?.version ?? "V1",
          page_count: form.page_count,
        })),
    ]),
  );

export function lookupCompanyName(companyId: number): { en: string; zh: string } {
  const insurer = coverageRegistry.find((c) => c.company_id === companyId);
  return insurer
    ? { en: insurer.company_name_en, zh: insurer.company_name_zh }
    : { en: "Unknown insurer", zh: "未知保險公司" };
}

export function lookupFormName(templateId: number): { en: string; zh: string } {
  for (const insurer of coverageRegistry) {
    const form = insurer.forms.find((f) => f.template_id === templateId);
    if (form) return { en: form.form_name_en, zh: form.form_name_zh };
  }
  return { en: "Unknown form", zh: "未知表格" };
}

// --- claims ---------------------------------------------------------------------

// Fresh deep copies of the seed claims (the stateful store mutates its copy).
export function seedClaims(): ClaimOut[] {
  return structuredClone(universe.claims) as unknown as ClaimOut[];
}

export const intakeRecords: Record<string, string> = universe.intake_records;

// Canned per-field AI extraction results (value + confidence), keyed by
// field_code. Intentionally partial against the 101 schema so required fields
// are left needing input, and icd10_code carries an invalid value ("J06,9") so
// the inline-validation state is demo-reachable.
export const extractionCanned = universe.extraction_canned as Record<
  string,
  { value: string; confidence: number }
>;

// PHI-redacted oversight views for the operator console: patient names are
// never rendered at portfolio level (reachable only inside an impersonation
// session), and final field values are withheld pending the redaction rule.
export function adminClaimList(): ClaimListItem[] {
  return seedClaims().map((c) => ({
    id: c.id,
    submission_no: c.submission_no,
    patient_name: null,
    company_id: c.company_id,
    template_id: c.template_id,
    status: c.status,
    created_at: c.created_at,
  }));
}

export function adminClaims(): ClaimOut[] {
  return seedClaims().map((c) => ({
    ...c,
    patient_name: null,
    ai_raw_result: null,
  }));
}

// Dashboard-style overview derived from the (possibly mutated) claim set. The
// clinic label defaults to the fixture session clinic; callers pass the active
// session's clinic so the label follows clinic selection (ADR 0041).
export function homeOverviewFrom(
  claims: ClaimOut[],
  clinicLabel: string = clinicName,
): HomeOverview {
  const drafts = claims.filter((c) => c.status === "DRAFT" || c.status === "AI_FILLED");
  const printed = claims.filter((c) => c.status === "PRINTED");
  const latestDay = claims.reduce(
    (max, c) => (c.created_at.slice(0, 10) > max ? c.created_at.slice(0, 10) : max),
    "",
  );
  return {
    greeting_name: greetingName,
    clinic_name: clinicLabel,
    stats: {
      today_count: claims.filter((c) => c.created_at.startsWith(latestDay)).length,
      pending_draft_count: drafts.length,
      month_total_count: claims.length,
    },
    unfinished_drafts: drafts.map((c) => ({
      submission_id: c.id,
      patient_name: c.patient_name,
      company_name: lookupCompanyName(c.company_id).zh,
      template_name: lookupFormName(c.template_id).zh,
      status: c.status,
      status_label: c.status === "AI_FILLED" ? "待核對字段" : "草稿",
      updated_at: c.created_at,
    })),
    quick_start_shortcuts: [
      {
        company_id: 1,
        company_name: lookupCompanyName(1).zh,
        template_id: 101,
        template_name: lookupFormName(101).zh,
      },
    ],
    recent_claims: printed.slice(0, 5).map((c) => ({
      submission_id: c.id,
      patient_name: c.patient_name,
      company_name: lookupCompanyName(c.company_id).zh,
      status: c.status,
      status_label: "已打印",
      created_at: c.created_at,
    })),
  };
}

// --- frontend-only fixtures --------------------------------------------------------

const fo = universe.frontend_only;

export const printCaptures = fo.print_captures as unknown as InboxDocument[];
export const handoffs = fo.handoffs as unknown as StaffHandoff[];
export const notifications = fo.notifications as unknown as NotificationItem[];
export const doctorSettings = fo.doctor_settings as unknown as DoctorSettings;
export const supportAccess = fo.support_access as unknown as SupportAccessState;
export const tickets = fo.tickets as unknown as Ticket[];
export const onboardingQueue = fo.onboarding_queue as unknown as OnboardingQueueItem[];
export const tags = fo.tags as unknown as Tag[];
export const tagVisibility = fo.tag_visibility as unknown as TagVisibilityEntry[];
export const savedViews = fo.saved_views as unknown as SavedView[];
/** Legacy fixture rows; migrated to AuditLogOut shape in frontend-only-store. */
export const demoAudit = fo.audit_events as unknown as Array<{
  id: string;
  ts: string;
  operator: string;
  action: string;
  target: string;
  mode: "view-as" | "act-as" | null;
}>;
export const analyticsOverview = fo.analytics.overview as AnalyticsOverview;
export const analyticsUsage = fo.analytics.usage as UsagePoint[];
export const analyticsFunnel = fo.analytics.funnel as ActivationFunnel;
export const analyticsVerification = fo.analytics.verification as VerificationReport;
export const analyticsQuality = fo.analytics.quality as QualityReport;
export const analyticsErrors = fo.analytics.errors as UsagePoint[];
