import type { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { getCurrentUser } from "@/lib/auth"
import { VERIFICATION_STATUS_LABEL } from "@/lib/labels"
import { displayName } from "@/server/access"
import { buildVerificationWhere, parseVerificationFilters } from "@/server/verification-filters"
import { addSheet, newWorkbook, xlsxResponse, type Column } from "@/server/excel"

export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: "Требуется вход" }, { status: 401 })
  const isVerifier = user.role === "VERIFIER"

  const filters = parseVerificationFilters(Object.fromEntries(req.nextUrl.searchParams))
  const items = await prisma.verification.findMany({
    where: buildVerificationWhere(filters, user.id),
    include: {
      verifier: true,
      agent: { select: { name: true, login: true } },
      owner: { select: { name: true, login: true, companyName: true } },
    },
    orderBy: [{ handedAt: "desc" }, { createdAt: "desc" }],
  })

  const columns: Column[] = [
    { header: "Модель", key: "model", width: 22 },
    { header: "IMEI1", key: "imei1", width: 18, type: "text" },
    { header: "IMEI2", key: "imei2", width: 18, type: "text" },
    { header: "Серийный номер", key: "serial", width: 16, type: "text" },
    isVerifier
      ? { header: "От кого", key: "from", width: 20 }
      : { header: "Верификатор", key: "agent", width: 20 },
    { header: "Человек (ФИО)", key: "name", width: 24 },
    { header: "Телефон человека", key: "phone", width: 16 },
    ...(isVerifier ? [{ header: "Страна", key: "country", width: 14 }] : []),
    { header: "Дата передачи", key: "handedAt", width: 12, type: "date" },
    { header: "Статус", key: "status", width: 15 },
    { header: "Дата завершения", key: "completedAt", width: 12, type: "date" },
    { header: isVerifier ? "Мне заплатят" : "Сумма верификатору", key: "fee", width: 14, type: "money" },
    { header: isVerifier ? "Мне оплатили" : "Верификатору оплачено", key: "feePaid", width: 12 },
    { header: "Оплата человеку", key: "payment", width: 14, type: "money" },
    { header: "Человеку оплачено", key: "isPaid", width: 12 },
    ...(isVerifier ? [{ header: "Прибыль", key: "profit", width: 13, type: "money" as const }] : []),
    { header: "Заметка", key: "note", width: 30 },
  ]

  const rows = items.map((v) => {
    const isOwner = v.ownerId === user.id
    const handler = (v.agentId ?? v.ownerId) === user.id
    const viaAgent = !!v.agentId && v.agentId !== v.ownerId
    const hasFee = !!v.agentId
    return {
      model: v.phoneModel,
      imei1: v.imei1,
      imei2: v.imei2 ?? "",
      serial: v.serialNumber ?? "",
      from: isOwner ? "свой" : v.owner.companyName || displayName(v.owner),
      agent: viaAgent && v.agent ? displayName(v.agent) : "",
      // данные человека — только тому, кто с ним работает
      name: handler ? (v.verifier?.fullName ?? "") : viaAgent ? (v.verifierId ? "найден верификатором" : "ищет верификатор") : "",
      phone: handler ? (v.verifier?.phone ?? "") : "",
      country: handler ? (v.country ?? "") : "",
      handedAt: v.handedAt,
      status: VERIFICATION_STATUS_LABEL[v.status],
      completedAt: v.completedAt,
      fee: hasFee ? v.agentFee : null,
      feePaid: hasFee && v.agentFee ? (v.agentPaid ? "да" : "нет") : "",
      payment: handler ? v.payment : null,
      isPaid: handler && v.payment ? (v.isPaid ? "да" : "нет") : "",
      profit: isVerifier && v.agentId === user.id ? v.agentFee - v.payment : null,
      note: isOwner ? (v.note ?? "") : (v.agentNote ?? ""),
    }
  })

  const wb = newWorkbook()
  const ws = addSheet(wb, "Верификации", columns, rows)
  if (rows.length) {
    const sum = (k: "fee" | "payment" | "profit") => rows.reduce((a, r) => a + (r[k] ?? 0), 0)
    const total = ws.addRow({ model: `Итого: ${rows.length}`, fee: sum("fee"), payment: sum("payment"), profit: isVerifier ? sum("profit") : undefined })
    total.font = { bold: true }
  }
  return xlsxResponse(wb, "Верификации", "verifications")
}
