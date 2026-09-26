import { prisma } from '@/lib/prisma'
import { SupportTicket } from '@prisma/client'

export async function createSupportTicketEvent(ticket: SupportTicket) {
  const eventId = `support-ticket-${ticket.id}-${Date.now()}`
  return prisma.eventOutbox.create({
    data: {
      eventId,
      eventType: 'support.ticket.created',
      payload: {
        ticketId: ticket.id,
        userId: ticket.userId,
        name: ticket.name,
        phone: ticket.phone,
        lineId: ticket.lineId,
        subject: ticket.subject,
        message: ticket.message,
        status: ticket.status,
        createdAt: ticket.createdAt.toISOString(),
      },
      channel: 'in_app',
      status: 'pending',
    },
  })
}
