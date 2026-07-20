// frontend-only: pending backend
//
// Form-tag taxonomy (type / insurer / specialty) + the per-doctor visibility
// matrix (the console's LIBRARY tags destination). Retiring a tag re-maps its
// members (tag-integrity rule) and is never an orphaning delete.

import type {
  SuccessResponse,
  Tag,
  TagCreate,
  TagKind,
  TagRetireRequest,
  TagRetireResult,
  TagUpdate,
  TagVisibilityEntry,
} from "@acuity/types";
import { api } from "../../client";

export type { Tag, TagCreate, TagKind, TagRetireRequest, TagRetireResult, TagUpdate, TagVisibilityEntry };

export function listTags(kind?: TagKind): Promise<Tag[]> {
  return api.get<Tag[]>("/admin/tags", { query: kind ? { kind } : undefined });
}

export function createTag(body: TagCreate): Promise<Tag> {
  return api.post<Tag>("/admin/tags", body);
}

export function updateTag(tagId: number, body: TagUpdate): Promise<Tag> {
  return api.put<Tag>(`/admin/tags/${tagId}`, body);
}

export function retireTag(tagId: number, body: TagRetireRequest = {}): Promise<TagRetireResult> {
  return api.post<TagRetireResult>(`/admin/tags/${tagId}/retire`, body);
}

export function getTagVisibility(doctorId?: number): Promise<TagVisibilityEntry[]> {
  return api.get<TagVisibilityEntry[]>("/admin/tags/visibility", {
    query: doctorId === undefined ? undefined : { doctor_id: doctorId },
  });
}

export function setTagVisibility(entries: TagVisibilityEntry[]): Promise<SuccessResponse> {
  return api.put<SuccessResponse>("/admin/tags/visibility", { entries });
}
