// frontend-only: pending backend
//
// Operations tickets + the clinic onboarding queue (the console's OPERATIONS
// destination). No backend equivalent; the whole destination is mock-first.

import type {
  OnboardingQueueItem,
  Page,
  Ticket,
  TicketStatus,
  TicketUpdate,
} from "@acuity/types";
import { api } from "../../client";

export type { OnboardingQueueItem, Ticket, TicketStatus, TicketUpdate };

// A type alias (not interface) so it is assignable to the client's query index
// signature.
export type ListTicketsQuery = {
  page?: number;
  page_size?: number;
  status?: TicketStatus;
  owner?: string;
};

export function listTickets(query: ListTicketsQuery = {}): Promise<Page<Ticket>> {
  return api.get<Page<Ticket>>("/admin/tickets", { query });
}

export function getTicket(ticketId: string): Promise<Ticket> {
  return api.get<Ticket>(`/admin/tickets/${ticketId}`);
}

export function updateTicket(ticketId: string, body: TicketUpdate): Promise<Ticket> {
  return api.put<Ticket>(`/admin/tickets/${ticketId}`, body);
}

export function resolveTicket(ticketId: string, resolutionNote?: string): Promise<Ticket> {
  return api.post<Ticket>(`/admin/tickets/${ticketId}/resolve`, {
    resolution_note: resolutionNote,
  });
}

export function listOnboardingQueue(): Promise<OnboardingQueueItem[]> {
  return api.get<OnboardingQueueItem[]>("/admin/onboarding-queue");
}
