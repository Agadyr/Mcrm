import "server-only"
import type { PhoneEventType, Prisma } from "@prisma/client"

export function logEvent(
  tx: Prisma.TransactionClient,
  phoneId: string,
  type: PhoneEventType,
  message: string,
  userId?: string | null
) {
  return tx.phoneEvent.create({ data: { phoneId, type, message, userId: userId ?? null } })
}
