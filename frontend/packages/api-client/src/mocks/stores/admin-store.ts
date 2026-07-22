// In-memory, module-scoped store for the admin entity groups — mutable copies
// of the shared fixture universe so console CRUD, enablement toggles, template
// parsing simulation, and the row_version optimistic lock behave statefully.

import type {
  ClinicOut,
  CompanyOut,
  DoctorOut,
  DomainOut,
  StandardFieldOut,
  TemplateFieldOut,
  TemplateOut,
  TransformRuleOut,
} from "@acuity/types";
import type { DistrictOut } from "../../endpoints/districts";
import {
  demoClinics,
  demoCompaniesFull,
  demoDoctors,
  demoDomains,
  demoStandardFields,
  demoTemplateFields,
  demoTemplatesAdmin,
  demoTransformRules,
} from "../fixtures/universe";

const DEMO_DISTRICTS: DistrictOut[] = [
  { id: 1, name_zh: "中環", name_en: "Central", region: "港島" },
  { id: 2, name_zh: "灣仔", name_en: "Wan Chai", region: "港島" },
  { id: 3, name_zh: "銅鑼灣", name_en: "Causeway Bay", region: "港島" },
  { id: 4, name_zh: "半山", name_en: "Mid-Levels", region: "港島" },
  { id: 5, name_zh: "太古", name_en: "Tai Koo", region: "港島" },
  { id: 6, name_zh: "尖沙咀", name_en: "Tsim Sha Tsui", region: "九龍" },
  { id: 7, name_zh: "旺角", name_en: "Mong Kok", region: "九龍" },
  { id: 8, name_zh: "沙田", name_en: "Sha Tin", region: "新界" },
];

export type ClinicSubscriptionRecord = {
  clinic_id: number;
  subscription_status: "trial" | "active" | "cancelled" | "expired";
  plan_code: string | null;
  price: number | null;
  currency: string;
  payment_status: "unpaid" | "paid" | "overdue" | "refunded" | null;
  payment_method: "bank_transfer" | "credit_card" | "cheque" | "other" | null;
  note_content: string | null;
  note_format: "html" | "markdown";
  note_updated_by: number | null;
  note_updated_at: string | null;
  updated_at: string;
};

export interface AdminState {
  clinics: ClinicOut[];
  doctors: DoctorOut[];
  companies: CompanyOut[];
  templates: TemplateOut[];
  templateFields: Map<number, TemplateFieldOut[]>;
  domains: DomainOut[];
  standardFields: StandardFieldOut[];
  transformRules: TransformRuleOut[];
  districts: DistrictOut[];
  // clinic_id -> enabled company ids.
  clinicInsurers: Map<number, number[]>;
  // clinic_id -> enabled template ids.
  clinicTemplates: Map<number, number[]>;
  // clinic_id -> 1:1 subscription record
  clinicSubscriptions: Map<number, ClinicSubscriptionRecord>;
  // clinic_id -> retention override (absent = use global default)
  clinicRetention: Map<number, ClinicRetentionOverrideRecord>;
  clinicRetentionAudits: ClinicRetentionAuditRecord[];
  defaultRetentionDays: number;
  defaultRetentionPolicyName: string;
  // template_id -> simulated parse progress (advances on each poll).
  parseProgress: Map<number, number>;
  nextId: number;
}

export type ClinicRetentionOverrideRecord = {
  clinic_id: number;
  is_overridden: number;
  retention_days: number | null;
  overridden_by: number | null;
  overridden_at: string | null;
};

export type ClinicRetentionAuditRecord = {
  id: number;
  clinic_id: number;
  clinic_code_input: string;
  old_retention_days: number;
  new_retention_days: number;
  operated_by: number;
  operator_name: string | null;
  operated_at: string;
  ip_address: string | null;
};

export const DEFAULT_RETENTION_DAYS = 2555;
export const DEFAULT_RETENTION_POLICY_NAME = "標準保留政策";

export function effectiveClinicRetention(
  s: AdminState,
  clinicId: number,
): {
  clinic_id: number;
  retention_days: number;
  is_overridden: boolean;
  policy_name: string | null;
  overridden_at: string | null;
  overridden_by: number | null;
} {
  const row = s.clinicRetention.get(clinicId);
  if (row && row.is_overridden === 1 && row.retention_days != null) {
    return {
      clinic_id: clinicId,
      retention_days: row.retention_days,
      is_overridden: true,
      policy_name: null,
      overridden_at: row.overridden_at,
      overridden_by: row.overridden_by,
    };
  }
  return {
    clinic_id: clinicId,
    retention_days: s.defaultRetentionDays,
    is_overridden: false,
    policy_name: s.defaultRetentionPolicyName,
    overridden_at: null,
    overridden_by: null,
  };
}

export function defaultClinicSubscription(
  clinicId: number,
  notes = "",
): ClinicSubscriptionRecord {
  return {
    clinic_id: clinicId,
    subscription_status: "trial",
    plan_code: null,
    price: null,
    currency: "HKD",
    payment_status: null,
    payment_method: null,
    note_content: notes || null,
    note_format: "markdown",
    note_updated_by: null,
    note_updated_at: null,
    updated_at: new Date().toISOString(),
  };
}

let state: AdminState | null = null;

export function adminState(): AdminState {
  if (!state) {
    const publishedActive = demoTemplatesAdmin
      .filter((t) => t.parse_status === "PUBLISHED" && t.is_active)
      .map((t) => t.id);
    const activeCompanies = demoCompaniesFull
      .filter((c) => c.status === 1)
      .map((c) => c.id);
    state = {
      clinics: structuredClone(demoClinics).map((c) => ({
        ...c,
        data_region: c.data_region ?? "香港",
        is_flagged: c.is_flagged ?? 0,
      })),
      doctors: structuredClone(demoDoctors),
      companies: structuredClone(demoCompaniesFull),
      templates: structuredClone(demoTemplatesAdmin),
      templateFields: new Map(
        Object.entries(demoTemplateFields).map(([k, v]) => [
          Number(k),
          structuredClone(v),
        ]),
      ),
      domains: structuredClone(demoDomains),
      standardFields: structuredClone(demoStandardFields),
      transformRules: structuredClone(demoTransformRules),
      districts: structuredClone(DEMO_DISTRICTS),
      clinicInsurers: new Map(
        demoClinics.map((c) => [c.id, c.status === 1 ? [...activeCompanies] : []]),
      ),
      clinicTemplates: new Map(
        demoClinics.map((c) => [c.id, c.status === 1 ? [...publishedActive] : []]),
      ),
      clinicSubscriptions: new Map(
        demoClinics.map((c) => {
          const notes =
            typeof (c as { notes?: unknown }).notes === "string"
              ? String((c as { notes?: unknown }).notes)
              : "";
          return [c.id, defaultClinicSubscription(c.id, notes)];
        }),
      ),
      clinicRetention: new Map(),
      clinicRetentionAudits: [],
      defaultRetentionDays: DEFAULT_RETENTION_DAYS,
      defaultRetentionPolicyName: DEFAULT_RETENTION_POLICY_NAME,
      parseProgress: new Map(),
      nextId: 10000,
    };
  }
  return state;
}

export function nextAdminId(): number {
  return adminState().nextId++;
}

// Test/dev helper: drop all state and reseed from the fixture universe.
export function resetAdminStore(): void {
  state = null;
}
