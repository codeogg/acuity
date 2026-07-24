// Admin operations tickets + clinic onboarding queue (live FastAPI).

import type {
  OnboardingQueueItem,
  Page,
  Ticket,
  TicketStatus,
  TicketUpdate,
} from "@acuity/types";
import { api, type RequestOptions } from "../client";

export type { OnboardingQueueItem, Ticket, TicketStatus, TicketUpdate };

export type ListTicketsQuery = {
  page?: number;
  page_size?: number;
  status?: TicketStatus;
  owner?: string;
};

export function listTickets(
  query: ListTicketsQuery = {},
  options?: RequestOptions,
): Promise<Page<Ticket>> {
  return api.get<Page<Ticket>>("/admin/tickets", { ...options, query });
}

export function getTicket(ticketId: string, options?: RequestOptions): Promise<Ticket> {
  return api.get<Ticket>(`/admin/tickets/${ticketId}`, options);
}

export function updateTicket(
  ticketId: string,
  body: TicketUpdate,
  options?: RequestOptions,
): Promise<Ticket> {
  return api.put<Ticket>(`/admin/tickets/${ticketId}`, body, options);
}

export function resolveTicket(
  ticketId: string,
  resolutionNote?: string,
  options?: RequestOptions,
): Promise<Ticket> {
  return api.post<Ticket>(
    `/admin/tickets/${ticketId}/resolve`,
    { resolution_note: resolutionNote },
    options,
  );
}

export function listOnboardingQueue(options?: RequestOptions): Promise<OnboardingQueueItem[]> {
  return api.get<OnboardingQueueItem[]>("/admin/onboarding-queue", options);
}
