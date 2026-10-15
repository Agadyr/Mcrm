import "server-only"
import { ACTIVE_VERIFICATION_STATUSES } from "@/lib/labels"
import type { Prisma } from "@prisma/client"
import { PHONE_STATUS_LABEL } from "@/lib/labels"
import { logEvent } from "./history"

/**
 * Приводит статус товара в соответствие с его верификациями:
 *  - есть «Передан» / «В процессе» → «На верификации»
 *  - активных нет, а товар «На верификации» → «В наличии»
 *  - пометка «верифицирован» = есть хотя бы одна верификация со статусом «Верифицирован»
 * Проданные телефоны, резерв и возврат по статусу не трогаем.
 */
export async function syncPhoneWithVerifications(
  tx: Prisma.TransactionClient,
  phoneId: string,
  userId?: string | null
) {
  const phone = await tx.phone.findUnique({
    where: { id: phoneId },
    select: { status: true, isVerified: true },
  })
  if (!phone) return

  const [activeCount, verifiedCount] = await Promise.all([
    tx.verification.count({ where: { phoneId, status: { in: ACTIVE_VERIFICATION_STATUSES } } }),
    tx.verification.count({ where: { phoneId, status: "VERIFIED" } }),
  ])

  let status = phone.status
  if (activeCount > 0 && status === "IN_STOCK") status = "ON_VERIFICATION"
  if (activeCount === 0 && status === "ON_VERIFICATION") status = "IN_STOCK"
  const isVerified = verifiedCount > 0

  if (status !== phone.status || isVerified !== phone.isVerified) {
    await tx.phone.update({ where: { id: phoneId }, data: { status, isVerified } })
  }
  if (status !== phone.status) {
    await logEvent(
      tx,
      phoneId,
      "STATUS_CHANGED",
      `Статус: ${PHONE_STATUS_LABEL[phone.status]} → ${PHONE_STATUS_LABEL[status]}${isVerified && status === "IN_STOCK" ? " (верифицирован)" : ""}`,
      userId
    )
  }
}
