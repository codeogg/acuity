// Admin insurance companies — CRUD + paging + status toggle + logo upload.
// All routes under /api/admin/insurance-companies.

import type {
  CompanyCreate,
  CompanyOut,
  CompanyStatusUpdate,
  CompanyUpdate,
  LogoUploadResponse,
  Page,
} from "@acuity/types";
import { api } from "../client";

// A type alias (not interface) so it is assignable to the client's query index
// signature.
export type ListCompaniesQuery = {
  page?: number;
  page_size?: number;
  keyword?: string;
};

export function listCompanies(query: ListCompaniesQuery = {}): Promise<Page<CompanyOut>> {
  return api.get<Page<CompanyOut>>("/admin/insurance-companies", { query });
}

export function getCompany(companyId: number): Promise<CompanyOut> {
  return api.get<CompanyOut>(`/admin/insurance-companies/${companyId}`);
}

export function createCompany(body: CompanyCreate): Promise<CompanyOut> {
  return api.post<CompanyOut>("/admin/insurance-companies", body);
}

export function updateCompany(companyId: number, body: CompanyUpdate): Promise<CompanyOut> {
  return api.put<CompanyOut>(`/admin/insurance-companies/${companyId}`, body);
}

export function setCompanyStatus(
  companyId: number,
  body: CompanyStatusUpdate,
): Promise<CompanyOut> {
  return api.patch<CompanyOut>(`/admin/insurance-companies/${companyId}/status`, body);
}

// 204 No Content on success.
export function deleteCompany(companyId: number): Promise<void> {
  return api.delete<void>(`/admin/insurance-companies/${companyId}`);
}

// Multipart upload; returns the stored logo URL.
export function uploadCompanyLogo(file: File | Blob, filename?: string): Promise<LogoUploadResponse> {
  const form = new FormData();
  form.append("file", file, filename);
  return api.postForm<LogoUploadResponse>("/admin/insurance-companies/logo", form);
}
