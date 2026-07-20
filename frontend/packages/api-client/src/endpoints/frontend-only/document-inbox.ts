// frontend-only: pending backend
//
// Document inbox — records captured by the virtual printer (and future upload
// channels) waiting to be imported into a claim intake. The commissioned spec
// names a document inbox; the demo backend has no equivalent.

import type { InboxDocument, InboxDocumentStatus, InboxImportResult } from "@acuity/types";
import { api } from "../../client";

export type { InboxDocument, InboxDocumentStatus, InboxImportResult };

// Back-compat alias: the intake import list consumed this shape as CaptureRecord.
export type CaptureRecord = InboxDocument;

export function listInboxDocuments(): Promise<InboxDocument[]> {
  return api.get<InboxDocument[]>("/doctor/document-inbox");
}

// The original invented endpoint the intake surface calls; same data, filtered
// to virtual-printer captures.
export function listPrintCaptures(): Promise<InboxDocument[]> {
  return api.get<InboxDocument[]>("/doctor/print-captures");
}

// Import a captured document's text into an intake (marks it imported).
export function importInboxDocument(documentId: string): Promise<InboxImportResult> {
  return api.post<InboxImportResult>(`/doctor/document-inbox/${documentId}/import`);
}
