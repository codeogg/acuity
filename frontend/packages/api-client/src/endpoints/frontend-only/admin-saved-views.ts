// frontend-only: pending backend
//
// Saved views for the console ops grids (clinics / doctors / forms / claims /
// audit): named filter+sort presets rendered as a tab strip with counts, a
// default view, and starring.

import type { SavedView, SavedViewCreate, SavedViewUpdate } from "@acuity/types";
import { api } from "../../client";

export type { SavedView, SavedViewCreate, SavedViewUpdate };

export function listSavedViews(grid?: string): Promise<SavedView[]> {
  return api.get<SavedView[]>("/admin/saved-views", {
    query: grid ? { grid } : undefined,
  });
}

export function createSavedView(body: SavedViewCreate): Promise<SavedView> {
  return api.post<SavedView>("/admin/saved-views", body);
}

export function updateSavedView(viewId: string, body: SavedViewUpdate): Promise<SavedView> {
  return api.put<SavedView>(`/admin/saved-views/${viewId}`, body);
}

// 204 No Content on success.
export function deleteSavedView(viewId: string): Promise<void> {
  return api.delete<void>(`/admin/saved-views/${viewId}`);
}
