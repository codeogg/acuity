// Admin templates + template-field mapping. Establishes the 409 optimistic-lock
// pattern (row_version) the editing UI must handle. A PUT/PATCH on a template
// field with a stale row_version rejects with ApiError kind "conflict"
// (isConflict === true) — callers re-fetch the field and retry with the fresh
// row_version. All routes under /api/admin/templates.

import type {
  FieldIgnoreSave,
  PreviewFillRequest,
  PreviewFillResponse,
  ReparseResponse,
  TemplateFileReplaceResponse,
  TemplateUploadResponse,
  FieldMappingSave,
  FieldMappingSaveResult,
  FieldRestoreSave,
  ParseProgressOut,
  PublishPreviewOut,
  TemplateFieldCreate,
  TemplateFieldOut,
  TemplateFieldUpdate,
  TemplateOut,
  TemplateUpdate,
} from "@acuity/types";
import { api, request } from "../client";

export function listTemplates(companyId?: number): Promise<TemplateOut[]> {
  return api.get<TemplateOut[]>("/admin/templates", {
    query: companyId === undefined ? undefined : { company_id: companyId },
  });
}

export function getTemplate(templateId: number): Promise<TemplateOut> {
  return api.get<TemplateOut>(`/admin/templates/${templateId}`);
}

// Multipart upload of a new template PDF (company_id + template_name + file).
// Parsing starts asynchronously; poll getParseProgress.
export function createTemplate(input: {
  company_id: number;
  template_name: string;
  file: File | Blob;
  filename?: string;
}): Promise<TemplateUploadResponse> {
  const form = new FormData();
  form.append("company_id", String(input.company_id));
  form.append("template_name", input.template_name);
  form.append("file", input.file, input.filename);
  return api.postForm<TemplateUploadResponse>("/admin/templates", form);
}

// 204 No Content on success (archive/delete).
export function deleteTemplate(templateId: number): Promise<void> {
  return api.delete<void>(`/admin/templates/${templateId}`);
}

// Replace the template's PDF file (multipart) — triggers a re-parse.
export function replaceTemplateFile(
  templateId: number,
  file: File | Blob,
  filename?: string,
): Promise<TemplateFileReplaceResponse> {
  const form = new FormData();
  form.append("file", file, filename);
  return request<TemplateFileReplaceResponse>(`/admin/templates/${templateId}/file`, {
    method: "PUT",
    form,
  });
}

// Re-run parsing on the stored PDF (e.g. after a failed parse).
export function reparseTemplate(templateId: number): Promise<ReparseResponse> {
  return api.post<ReparseResponse>(`/admin/templates/${templateId}/reparse`);
}

// Render a preview PDF filled with sample values.
export function previewFill(
  templateId: number,
  body: PreviewFillRequest,
): Promise<PreviewFillResponse> {
  return api.post<PreviewFillResponse>(`/admin/templates/${templateId}/preview-fill`, body);
}

export function updateTemplate(
  templateId: number,
  body: TemplateUpdate,
): Promise<TemplateOut> {
  return api.put<TemplateOut>(`/admin/templates/${templateId}`, body);
}

export function getParseProgress(templateId: number): Promise<ParseProgressOut> {
  return api.get<ParseProgressOut>(`/admin/templates/${templateId}/parse-progress`);
}

export function getPublishPreview(templateId: number): Promise<PublishPreviewOut> {
  return api.get<PublishPreviewOut>(`/admin/templates/${templateId}/publish-preview`);
}

export function publishTemplate(templateId: number): Promise<TemplateOut> {
  return api.post<TemplateOut>(`/admin/templates/${templateId}/publish`);
}

export function listTemplateFields(templateId: number): Promise<TemplateFieldOut[]> {
  return api.get<TemplateFieldOut[]>(`/admin/templates/${templateId}/fields`);
}

export function createTemplateField(
  templateId: number,
  body: TemplateFieldCreate,
): Promise<TemplateFieldOut> {
  return api.post<TemplateFieldOut>(`/admin/templates/${templateId}/fields`, body);
}

// row_version REQUIRED in body — 409 on mismatch (ApiError.isConflict).
export function updateTemplateField(
  templateId: number,
  fieldId: number,
  body: TemplateFieldUpdate,
): Promise<TemplateFieldOut> {
  return api.put<TemplateFieldOut>(
    `/admin/templates/${templateId}/fields/${fieldId}`,
    body,
  );
}

export function saveFieldMapping(
  templateId: number,
  fieldId: number,
  body: FieldMappingSave,
): Promise<FieldMappingSaveResult> {
  return api.post<FieldMappingSaveResult>(
    `/admin/templates/${templateId}/fields/${fieldId}/mapping`,
    body,
  );
}

// row_version REQUIRED — 409 on mismatch.
export function ignoreTemplateField(
  templateId: number,
  fieldId: number,
  body: FieldIgnoreSave,
): Promise<TemplateFieldOut> {
  return api.patch<TemplateFieldOut>(
    `/admin/templates/${templateId}/fields/${fieldId}/ignore`,
    body,
  );
}

export function restoreTemplateField(
  templateId: number,
  fieldId: number,
  body: FieldRestoreSave,
): Promise<TemplateFieldOut> {
  return api.patch<TemplateFieldOut>(
    `/admin/templates/${templateId}/fields/${fieldId}/restore`,
    body,
  );
}

// 204 No Content on success.
export function deleteTemplateField(templateId: number, fieldId: number): Promise<void> {
  return api.delete<void>(`/admin/templates/${templateId}/fields/${fieldId}`);
}
