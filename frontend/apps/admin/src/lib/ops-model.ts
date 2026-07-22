// Console operational model — enrichment over contract entities.
//
// Clinic lifecycle_status + activation now come from the API
// (provisioning → onboarding → active). Payment/subscription/plan still join
// from clinic_subscriptions; doctor MFA specialty / template confidence remain
// seed-backed until those fields land on the contract.

import type { ClinicOut, DoctorOut, TemplateFieldType, TemplateOut } from "@acuity/types";

export type ClinicOpsStatus = "provisioning" | "onboarding" | "active" | "needs-attention";
export type Activation = "setup" | "onboarding" | "active";
export type Payment = "paid" | "unpaid" | "overdue" | "refunded";
export type Subscription = "trial" | "active" | "cancelled" | "expired";
export type MfaState = "enrolled" | "mfa-pending" | "not-enrolled";

export interface ClinicOps {
  clinic_id: number;
  district_en: string;
  district_zh: string;
  ops_status: ClinicOpsStatus;
  activation: Activation;
  payment: Payment;
  subscription: Subscription;
  plan: "starter" | "practice" | "group";
  price_hkd_month: number;
  pay_method: "bank-transfer" | "credit-card" | "cheque" | "other" | "fps" | "none";
  last_activity: string;
  insurer_tags: string[];
  real_forms: number;
  idle_lock_minutes: number;
  residency: "hong-kong" | "singapore";
  retention_months: number;
  onboarding_step: number; // 0..8 (completed steps)
}

export interface DoctorOps {
  doctor_id: number;
  mfa: MfaState;
  specialty_en: string;
  specialty_zh: string;
  activation: Activation;
  last_activity: string;
  tags: string[];
  forms_processed: number;
  pass_rate: number;
}

export interface TemplateOps {
  template_id: number;
  confidence: number | null;
  usage_count: number;
  type_tag_id: number | null;
  // "Pipelines disagree" conflict candidates per field id (keystone editor).
  field_conflicts: Record<number, TemplateFieldType[]>;
}

export interface MfaDevice {
  id: string;
  label: string;
  enrolled_at: string;
  last_used_at: string | null;
}

export interface OperatorAccount {
  name: string;
  role: "super-admin" | "operator" | "support" | "read-only";
  email: string;
}

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const daysAgo = (d: number) => minutesAgo(d * 24 * 60);

// --- seeds (keyed by the fixture universe's real ids) --------------------------

const clinicSeed = new Map<number, ClinicOps>(
  (
    [
      [142, "Central", "中環", "needs-attention", "active", "paid", "active", "practice", 3800, "bank-transfer", minutesAgo(120), 6, 14, 3],
      [138, "Wan Chai", "灣仔", "active", "active", "paid", "active", "practice", 3800, "fps", minutesAgo(40), 8, 21, 2],
      [151, "Tsim Sha Tsui", "尖沙咀", "onboarding", "onboarding", "paid", "trial", "starter", 1900, "cheque", daysAgo(1), 3, 3, 5],
      [166, "Causeway Bay", "銅鑼灣", "provisioning", "setup", "unpaid", "trial", "starter", 1900, "none", minutesAgo(180), 4, 0, 5],
      [103, "Mid-Levels", "半山", "active", "active", "paid", "active", "group", 6400, "fps", minutesAgo(5), 8, 32, 2],
      [188, "Tai Koo", "太古", "onboarding", "onboarding", "unpaid", "trial", "practice", 3800, "none", minutesAgo(240), 2, 1, 5],
      [175, "Sha Tin", "沙田", "active", "active", "overdue", "active", "practice", 3800, "bank-transfer", daysAgo(1), 8, 18, 2],
      [197, "Mong Kok", "旺角", "provisioning", "setup", "unpaid", "trial", "starter", 1900, "none", minutesAgo(30), 2, 0, 5],
    ] as const
  ).map(([id, den, dzh, ops, act, pay, sub, plan, price, method, last, step, forms, lock]) => [
    id,
    {
      clinic_id: id,
      district_en: den,
      district_zh: dzh,
      ops_status: ops,
      activation: act,
      payment: pay,
      subscription: sub,
      plan,
      price_hkd_month: price,
      pay_method: method,
      last_activity: last,
      insurer_tags: [],
      real_forms: forms,
      idle_lock_minutes: lock,
      residency: "hong-kong",
      retention_months: 84,
      onboarding_step: step,
    },
  ]),
);

const doctorSeed = new Map<number, DoctorOps>(
  (
    [
      [2207, "mfa-pending", "General practice", "全科", "active", minutesAgo(60), 87, 94],
      [2188, "enrolled", "General practice", "全科", "active", minutesAgo(180), 132, 96],
      [2255, "mfa-pending", "General practice", "全科", "active", daysAgo(1), 41, 92],
      [2301, "enrolled", "Cardiology", "心臟科", "active", minutesAgo(40), 96, 97],
      [2320, "mfa-pending", "Cardiology", "心臟科", "onboarding", daysAgo(2), 12, 90],
      [2410, "enrolled", "Dermatology", "皮膚科", "onboarding", daysAgo(1), 18, 91],
      [2450, "mfa-pending", "Dermatology", "皮膚科", "onboarding", daysAgo(3), 6, 88],
      [2511, "not-enrolled", "Orthopaedics", "骨科", "setup", minutesAgo(180), 0, 0],
      [2044, "enrolled", "General practice", "全科", "active", minutesAgo(5), 154, 95],
      [2077, "enrolled", "General practice", "全科", "active", minutesAgo(120), 88, 93],
      [2688, "mfa-pending", "General practice", "全科", "onboarding", minutesAgo(240), 3, 89],
      [2690, "enrolled", "General practice", "全科", "onboarding", daysAgo(1), 9, 92],
      [2701, "enrolled", "General practice", "全科", "active", daysAgo(1), 64, 95],
      [2712, "not-enrolled", "General practice", "全科", "setup", minutesAgo(30), 0, 0],
    ] as const
  ).map(([id, mfa, sen, szh, act, last, forms, rate]) => [
    id,
    {
      doctor_id: id,
      mfa,
      specialty_en: sen,
      specialty_zh: szh,
      activation: act,
      last_activity: last,
      tags: [sen],
      forms_processed: forms,
      pass_rate: rate,
    },
  ]),
);

const templateSeed = new Map<number, TemplateOps>(
  (
    [
      [101, 0.97, 412, 1, {}],
      [102, 0.95, 233, 2, {}],
      [103, null, 0, 1, {}],
      [104, null, 0, 1, {}],
      // Keystone intake template: field 9102 carries a pipelines-disagree
      // conflict (date vs text) the editor resolves pick-one.
      [105, 0.81, 0, 1, { 9102: ["date", "text"] }],
      [201, 0.98, 1043, 4, {}],
      [202, 0.84, 0, 1, {}],
      [301, null, 0, 1, {}],
      [401, 0.94, 88, 3, {}],
    ] as [number, number | null, number, number, Record<number, TemplateFieldType[]>][]
  ).map(([id, conf, usage, typeTag, conflicts]) => [
    id,
    { template_id: id, confidence: conf, usage_count: usage, type_tag_id: typeTag, field_conflicts: conflicts },
  ]),
);

// --- operator profile (settings surface) ---------------------------------------

const operatorProfile = {
  name: "A. Founder",
  role: "super-admin" as const,
  email: "founder@acuity.hk",
};

const operators: OperatorAccount[] = [
  { name: "A. Founder", role: "super-admin", email: "founder@acuity.hk" },
  { name: "M. Cheng", role: "operator", email: "m.cheng@acuity.hk" },
];

let mfaDevices: MfaDevice[] = [
  { id: "key-1", label: "YubiKey 5C — Primary", enrolled_at: daysAgo(120), last_used_at: minutesAgo(30) },
  { id: "key-2", label: "YubiKey 5 NFC — Backup", enrolled_at: daysAgo(90), last_used_at: daysAgo(45) },
];

// --- accessors ------------------------------------------------------------------

const defaultClinicOps = (id: number): ClinicOps => ({
  clinic_id: id,
  district_en: "Hong Kong",
  district_zh: "香港",
  ops_status: "provisioning",
  activation: "setup",
  payment: "unpaid",
  subscription: "trial",
  plan: "starter",
  price_hkd_month: 1900,
  pay_method: "none",
  last_activity: new Date().toISOString(),
  insurer_tags: [],
  real_forms: 0,
  idle_lock_minutes: 5,
  residency: "hong-kong",
  retention_months: 84,
  onboarding_step: 0,
});

export function clinicOps(clinic: Pick<ClinicOut, "id"> & Partial<ClinicOut>): ClinicOps {
  let ops = clinicSeed.get(clinic.id);
  if (!ops) {
    ops = defaultClinicOps(clinic.id);
    clinicSeed.set(clinic.id, ops);
  }

  // Authoritative lifecycle from the API (provisioning → onboarding → active).
  // Needs-attention is a separate manual flag (is_flagged), not ops_status.
  const lifecycle = clinic.lifecycle_status;
  if (lifecycle === "provisioning" || lifecycle === "onboarding" || lifecycle === "active") {
    ops.ops_status = lifecycle;
    ops.activation =
      lifecycle === "provisioning" ? "setup" : lifecycle === "onboarding" ? "onboarding" : "active";
  }

  const sub = clinic.subscription_status;
  if (sub === "trial" || sub === "expired" || sub === "active" || sub === "cancelled") {
    ops.subscription = sub;
  }

  const pay = clinic.payment_status;
  if (pay === "paid" || pay === "unpaid" || pay === "overdue" || pay === "refunded") {
    ops.payment = pay;
  }

  const plan = clinic.plan_code;
  if (plan === "starter" || plan === "practice" || plan === "group") {
    ops.plan = plan;
  }

  if (clinic.district_name_en) ops.district_en = clinic.district_name_en;
  if (clinic.district_name_zh) ops.district_zh = clinic.district_name_zh;
  if (typeof clinic.idle_lock_minutes === "number") {
    ops.idle_lock_minutes = clinic.idle_lock_minutes;
  }

  return ops;
}

export function updateClinicOps(clinicId: number, patch: Partial<ClinicOps>): ClinicOps {
  const ops = clinicOps({ id: clinicId });
  Object.assign(ops, patch);
  return ops;
}

export function doctorOps(doctor: Pick<DoctorOut, "id" | "status">): DoctorOps {
  let ops = doctorSeed.get(doctor.id);
  if (!ops) {
    ops = {
      doctor_id: doctor.id,
      mfa: doctor.status === 1 ? "mfa-pending" : "not-enrolled",
      specialty_en: "General practice",
      specialty_zh: "全科",
      activation: "setup",
      last_activity: new Date().toISOString(),
      tags: ["General practice"],
      forms_processed: 0,
      pass_rate: 0,
    };
    doctorSeed.set(doctor.id, ops);
  }
  return ops;
}

export function updateDoctorOps(doctorId: number, patch: Partial<DoctorOps>): DoctorOps {
  const ops = doctorOps({ id: doctorId, status: 1 });
  Object.assign(ops, patch);
  return ops;
}

export function templateOps(template: Pick<TemplateOut, "id">): TemplateOps {
  let ops = templateSeed.get(template.id);
  if (!ops) {
    ops = { template_id: template.id, confidence: null, usage_count: 0, type_tag_id: null, field_conflicts: {} };
    templateSeed.set(template.id, ops);
  }
  return ops;
}

// The reference's template lifecycle, derived from the contract fields.
export type TemplateOpsStatus =
  | "uploaded"
  | "processing"
  | "processed"
  | "draft"
  | "confirmed"
  | "failed"
  | "archived";

export function templateOpsStatus(t: Pick<TemplateOut, "parse_status" | "is_active">): TemplateOpsStatus {
  switch (t.parse_status) {
    case "PENDING":
      return "uploaded";
    case "PARSING":
      return "processing";
    case "AUTO_PARSED":
    case "AI_ASSISTED":
      return "processed";
    case "ANNOTATED":
      return "draft";
    case "PUBLISHED":
      return t.is_active ? "confirmed" : "archived";
    case "PARSE_FAILED":
      return "failed";
    default:
      return "uploaded";
  }
}

export function intakeStatuses(): TemplateOpsStatus[] {
  return ["uploaded", "processing", "processed", "draft"];
}

export function getOperatorProfile(): OperatorAccount {
  return { ...operatorProfile };
}

export function updateOperatorProfile(patch: Partial<Pick<OperatorAccount, "name" | "email">>): void {
  Object.assign(operatorProfile, patch);
}

export function listOperators(): OperatorAccount[] {
  return operators.map((o) => (o.email === operatorProfile.email ? { ...o, name: operatorProfile.name } : { ...o }));
}

export function listMfaDevices(): MfaDevice[] {
  return mfaDevices.map((d) => ({ ...d }));
}

export function enrolMfaDevice(label: string): MfaDevice {
  const device = { id: `key-${Date.now()}`, label, enrolled_at: new Date().toISOString(), last_used_at: null };
  mfaDevices.push(device);
  return device;
}

export function removeMfaDevice(id: string): void {
  mfaDevices = mfaDevices.filter((d) => d.id !== id);
}
