// Admin standard-field dictionary, field domains, and value transform rules.
// Routes under /api/admin/{standard-fields,field-domains,transform-rules}.

import type {
  DomainCreate,
  DomainOut,
  StandardFieldCreate,
  StandardFieldOut,
  StandardFieldUpdate,
  TransformRuleCreate,
  TransformRuleOut,
} from "@acuity/types";
import { api } from "../client";

// --- field domains -----------------------------------------------------------

export function listDomains(): Promise<DomainOut[]> {
  return api.get<DomainOut[]>("/admin/field-domains");
}

export function createDomain(body: DomainCreate): Promise<DomainOut> {
  return api.post<DomainOut>("/admin/field-domains", body);
}

// --- standard fields -----------------------------------------------------------

// A type alias (not interface) so it is assignable to the client's query index
// signature.
export type ListStandardFieldsQuery = {
  domain_id?: number;
  keyword?: string;
  active_only?: boolean;
};

export function listStandardFields(
  query: ListStandardFieldsQuery = {},
): Promise<StandardFieldOut[]> {
  return api.get<StandardFieldOut[]>("/admin/standard-fields", { query });
}

export function createStandardField(body: StandardFieldCreate): Promise<StandardFieldOut> {
  return api.post<StandardFieldOut>("/admin/standard-fields", body);
}

export function updateStandardField(
  fieldId: number,
  body: StandardFieldUpdate,
): Promise<StandardFieldOut> {
  return api.put<StandardFieldOut>(`/admin/standard-fields/${fieldId}`, body);
}

// 204 No Content on success.
export function deleteStandardField(fieldId: number): Promise<void> {
  return api.delete<void>(`/admin/standard-fields/${fieldId}`);
}

// --- transform rules -----------------------------------------------------------

export function listTransformRules(): Promise<TransformRuleOut[]> {
  return api.get<TransformRuleOut[]>("/admin/transform-rules");
}

export function createTransformRule(body: TransformRuleCreate): Promise<TransformRuleOut> {
  return api.post<TransformRuleOut>("/admin/transform-rules", body);
}
