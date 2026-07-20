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

export interface AdminState {
  clinics: ClinicOut[];
  doctors: DoctorOut[];
  companies: CompanyOut[];
  templates: TemplateOut[];
  templateFields: Map<number, TemplateFieldOut[]>;
  domains: DomainOut[];
  standardFields: StandardFieldOut[];
  transformRules: TransformRuleOut[];
  // clinic_id -> enabled company ids.
  clinicInsurers: Map<number, number[]>;
  // clinic_id -> enabled template ids.
  clinicTemplates: Map<number, number[]>;
  // template_id -> simulated parse progress (advances on each poll).
  parseProgress: Map<number, number>;
  nextId: number;
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
      clinics: structuredClone(demoClinics),
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
      clinicInsurers: new Map(
        demoClinics.map((c) => [c.id, c.status === 1 ? [...activeCompanies] : []]),
      ),
      clinicTemplates: new Map(
        demoClinics.map((c) => [c.id, c.status === 1 ? [...publishedActive] : []]),
      ),
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
