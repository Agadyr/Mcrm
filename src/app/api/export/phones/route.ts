import type { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { getCurrentUser } from "@/lib/auth"
import { formatMemory } from "@/lib/format"
import { PAYMENT_METHOD_LABEL, PHONE_CONDITION_LABEL, PHONE_STATUS_LABEL, RFS_STATUS_LABEL } from "@/lib/labels"
import { buildPhoneOrderBy, buildPhoneWhere, parsePhoneFilters } from "@/server/phone-filters"
import { addSheet, newWorkbook, xlsxResponse, type Column } from "@/server/excel"

export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: "Требуется вход" }, { status: 401 })

  const filters = parsePhoneFilters(Object.fromEntries(req.nextUrl.searchParams))
  // ids — выгрузить только отмеченные в списке телефоны (через запятую)
  const ids = (req.nextUrl.searchParams.get("ids") ?? "").split(",").filter(Boolean).slice(0, 500)
  const phones = await prisma.phone.findMany({
    where: { AND: [buildPhoneWhere(filters, user.id), { ownerId: user.id }, ...(ids.length ? [{ id: { in: ids } }] : [])] },
    orderBy: buildPhoneOrderBy(filters.sort),
    include: { sales: { where: { cancelledAt: null }, take: 1, orderBy: { createdAt: "desc" } } },
  })

  const columns: Column[] = [
    { header: "Модель", key: "model", width: 22 },
    { header: "Память", key: "memory", width: 9 },
    { header: "Цвет", key: "color", width: 14 },
    { header: "IMEI1", key: "imei1", width: 18, type: "text" },
    { header: "IMEI2", key: "imei2", width: 18, type: "text" },
    { header: "Серийный номер", key: "serial", width: 16, type: "text" },
    { header: "Состояние", key: "condition", width: 10 },
    { header: "Статус", key: "status", width: 15 },
    { header: "Верифицирован", key: "verified", width: 13 },
    { header: "РФС", key: "rfs", width: 18 },
    { header: "Дата проверки РФС", key: "rfsCheckedAt", width: 12, type: "date" },
    { header: "Цена закупки", key: "purchasePrice", width: 14, type: "money" },
    { header: "Дата поступления", key: "receivedAt", width: 12, type: "date" },
    { header: "Поставщик", key: "supplier", width: 16 },
    { header: "Цена продажи", key: "salePrice", width: 14, type: "money" },
    { header: "Дата продажи", key: "soldAt", width: 12, type: "date" },
    { header: "Прибыль", key: "profit", width: 13, type: "money" },
    { header: "Покупатель", key: "buyer", width: 18 },
    { header: "Телефон покупателя", key: "buyerPhone", width: 16 },
    { header: "Способ оплаты", key: "payment", width: 12 },
    { header: "Заметка", key: "note", width: 30 },
  ]

  const rows = phones.map((p) => {
    const sale = p.sales[0]
    return {
      model: p.model,
      memory: formatMemory(p.memoryGb),
      color: p.color ?? "",
      imei1: p.imei1,
      imei2: p.imei2 ?? "",
      serial: p.serialNumber ?? "",
      condition: PHONE_CONDITION_LABEL[p.condition],
      status: PHONE_STATUS_LABEL[p.status],
      verified: p.isVerified ? "да" : "",
      rfs: p.rfsStatus ? RFS_STATUS_LABEL[p.rfsStatus] : "",
      rfsCheckedAt: p.rfsCheckedAt,
      purchasePrice: p.purchasePrice,
      receivedAt: p.receivedAt,
      supplier: p.supplier ?? "",
      salePrice: sale?.salePrice ?? null,
      soldAt: sale?.soldAt ?? null,
      profit: sale ? sale.salePrice - p.purchasePrice : null,
      buyer: sale?.buyerName ?? "",
      buyerPhone: sale?.buyerPhone ?? "",
      payment: sale ? PAYMENT_METHOD_LABEL[sale.paymentMethod] : "",
      note: p.note ?? "",
    }
  })

  const wb = newWorkbook()
  const ws = addSheet(wb, "Товары", columns, rows)
  if (rows.length) {
    const total = ws.addRow({
      model: `Итого: ${rows.length} шт.`,
      purchasePrice: rows.reduce((a, r) => a + r.purchasePrice, 0),
      salePrice: rows.reduce((a, r) => a + (r.salePrice ?? 0), 0),
      profit: rows.reduce((a, r) => a + (r.profit ?? 0), 0),
    })
    total.font = { bold: true }
  }
  return xlsxResponse(wb, "Товары", "phones")
}
