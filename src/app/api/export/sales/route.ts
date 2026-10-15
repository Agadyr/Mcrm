import type { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { getCurrentUser } from "@/lib/auth"
import { PAYMENT_METHOD_LABEL } from "@/lib/labels"
import { buildSaleWhere, parseSaleFilters } from "@/server/sale-filters"
import { addSheet, newWorkbook, xlsxResponse, type Column } from "@/server/excel"

/** Продажи в Excel: с теми же фильтрами, что на странице; второй лист — все оплаты */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: "Требуется вход" }, { status: 401 })
  if (user.role === "VERIFIER") return Response.json({ error: "Нет доступа" }, { status: 403 })

  const filters = parseSaleFilters(Object.fromEntries(req.nextUrl.searchParams))
  const items = await prisma.sale.findMany({
    where: buildSaleWhere(filters, user.id),
    include: {
      phone: { select: { model: true, imei1: true, imei2: true, purchasePrice: true } },
      payments: { orderBy: { paidAt: "asc" } },
    },
    orderBy: [{ soldAt: "desc" }, { createdAt: "desc" }],
  })

  const columns: Column[] = [
    { header: "Дата продажи", key: "soldAt", width: 12, type: "date" },
    { header: "Модель", key: "model", width: 22 },
    { header: "IMEI1", key: "imei1", width: 18, type: "text" },
    { header: "IMEI2", key: "imei2", width: 18, type: "text" },
    { header: "Покупатель", key: "buyer", width: 20 },
    { header: "Телефон покупателя", key: "buyerPhone", width: 17 },
    { header: "Цена продажи", key: "price", width: 14, type: "money" },
    { header: "Закупка", key: "purchase", width: 13, type: "money" },
    { header: "Прибыль", key: "profit", width: 13, type: "money" },
    { header: "Оплачено", key: "paid", width: 13, type: "money" },
    { header: "Долг", key: "debt", width: 13, type: "money" },
    { header: "Вернёт до", key: "dueDate", width: 12, type: "date" },
    { header: "Способ оплаты", key: "method", width: 14 },
    { header: "Статус", key: "state", width: 12 },
    { header: "Заметка", key: "note", width: 30 },
  ]
  const rows = items.map((s) => {
    const debt = s.cancelledAt ? 0 : Math.max(0, s.salePrice - s.paidAmount)
    return {
      soldAt: s.soldAt,
      model: s.phone.model,
      imei1: s.phone.imei1,
      imei2: s.phone.imei2 ?? "",
      buyer: s.buyerName ?? "",
      buyerPhone: s.buyerPhone ?? "",
      price: s.salePrice,
      purchase: s.phone.purchasePrice,
      profit: s.salePrice - s.phone.purchasePrice,
      paid: s.paidAmount,
      debt,
      dueDate: debt > 0 ? s.dueDate : null,
      method: PAYMENT_METHOD_LABEL[s.paymentMethod],
      state: s.cancelledAt ? "отменена" : debt > 0 ? "в долг" : "оплачено",
      note: s.note ?? "",
    }
  })

  const wb = newWorkbook()
  const ws = addSheet(wb, "Продажи", columns, rows)
  if (rows.length) {
    const sum = (k: "price" | "profit" | "paid" | "debt") => rows.reduce((a, r) => a + r[k], 0)
    const total = ws.addRow({ soldAt: null, model: `Итого: ${rows.length}`, price: sum("price"), profit: sum("profit"), paid: sum("paid"), debt: sum("debt") })
    total.font = { bold: true }
  }

  addSheet(
    wb,
    "Оплаты",
    [
      { header: "Дата оплаты", key: "paidAt", width: 12, type: "date" },
      { header: "Модель", key: "model", width: 22 },
      { header: "IMEI1", key: "imei1", width: 18, type: "text" },
      { header: "Покупатель", key: "buyer", width: 20 },
      { header: "Сумма", key: "amount", width: 13, type: "money" },
      { header: "Способ", key: "method", width: 14 },
      { header: "Заметка", key: "note", width: 30 },
    ],
    items.flatMap((s) =>
      s.payments.map((p) => ({
        paidAt: p.paidAt,
        model: s.phone.model,
        imei1: s.phone.imei1,
        buyer: s.buyerName ?? "",
        amount: p.amount,
        method: PAYMENT_METHOD_LABEL[p.method],
        note: p.note ?? "",
      }))
    )
  )
  return xlsxResponse(wb, "Продажи", "sales")
}
