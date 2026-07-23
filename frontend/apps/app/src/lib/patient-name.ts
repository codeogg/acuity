/** Format claim patient names for list / detail display. */
export function formatPatientDisplay(claim: {
  patient_name_cn?: string | null;
  patient_name_en?: string | null;
  patient_name?: string | null;
}): string {
  const cn = claim.patient_name_cn?.trim() || "";
  const en = claim.patient_name_en?.trim() || "";
  if (cn && en) return `${cn} / ${en}`;
  return cn || en || claim.patient_name?.trim() || "";
}
