// Re-export live tickets endpoints. MSW handlers in mocks/handlers/admin.ts
// still cover mock-first mode; live mode hits FastAPI /api/admin/tickets*.

export {
  getTicket,
  listOnboardingQueue,
  listTickets,
  resolveTicket,
  updateTicket,
  type ListTicketsQuery,
  type OnboardingQueueItem,
  type Ticket,
  type TicketStatus,
  type TicketUpdate,
} from "../tickets";
