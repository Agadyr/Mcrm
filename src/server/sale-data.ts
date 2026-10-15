import "server-only"
import type { Prisma } from "@prisma/client"
import type { SaleData } from "@/lib/validators/phone"

/** Данные продажи → запись в базе: сколько оплачено, срок долга и первая оплата (в день продажи) */
export function saleCreateData(d: SaleData) {
  const debtSale = d.paymentMethod === "DEBT"
  const paid = debtSale ? d.paidNow : d.salePrice
  const method = debtSale ? d.prepayMethod : d.paymentMethod
  return {
    salePrice: d.salePrice,
    soldAt: d.soldAt,
    buyerName: d.buyerName,
    buyerPhone: d.buyerPhone,
    paymentMethod: d.paymentMethod,
    note: d.note,
    paidAmount: paid,
    dueDate: debtSale ? d.dueDate : null,
    ...(paid > 0 ? { payments: { create: { amount: paid, paidAt: d.soldAt, method } } } : {}),
  } satisfies Omit<Prisma.SaleUncheckedCreateInput, "phoneId">
}
