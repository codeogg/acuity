// frontend-only: pending backend
//
// In-app notifications for the doctor surface (hand-offs ready to sign, AI
// drafts completed, published forms, system notices). Paged from day one —
// the list can grow without bound.

import type { NotificationItem, NotificationKind, Page, SuccessResponse } from "@acuity/types";
import { api } from "../../client";

export type { NotificationItem, NotificationKind };

// A type alias (not interface) so it is assignable to the client's query index
// signature.
export type ListNotificationsQuery = {
  page?: number;
  page_size?: number;
};

export function listNotifications(
  query: ListNotificationsQuery = {},
): Promise<Page<NotificationItem>> {
  return api.get<Page<NotificationItem>>("/doctor/notifications", { query });
}

export function markNotificationRead(notificationId: string): Promise<NotificationItem> {
  return api.post<NotificationItem>(`/doctor/notifications/${notificationId}/read`);
}

export function markAllNotificationsRead(): Promise<SuccessResponse> {
  return api.post<SuccessResponse>("/doctor/notifications/read-all");
}
