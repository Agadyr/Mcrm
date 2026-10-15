import { z } from "zod"
import { money, optDate, optImei, optInt, optMoney, optText, reqDate, reqImei, reqText } from "./common"

export const phoneStatusEnum = z.enum(["IN_STOCK", "ON_VERIFICATION", "SOLD", "RESERVED", "RETURNED"])
/** Чем заплатили (для оплат) */
export const paymentMethodEnum = z.enum(["CASH", "KASPI", "TRANSFER", "INSTALLMENT"])
/** Как продали: способ оплаты или «В долг» */
export const saleMethodEnum = z.enum(["CASH", "KASPI", "TRANSFER", "INSTALLMENT", "DEBT"])

export const phoneSchema = z
  .object({
    model: reqText("Укажите модель", 100),
    memoryGb: optInt(),
    color: optText(50),
    imei1: reqImei("Укажите IMEI1"),
    imei2: optImei(),
    serialNumber: optText(50).transform((v) => (v ? v.toUpperCase() : v)), // серийник всегда заглавными
    condition: z.enum(["NEW", "USED"]),
    purchasePrice: money("Укажите цену закупки"),
    receivedAt: reqDate("Укажите дату поступления"),
    supplier: optText(100),
    note: optText(2000),
    status: phoneStatusEnum,
  })
  .refine((d) => !d.imei2 || d.imei1 !== d.imei2, {
    path: ["imei2"],
    message: "IMEI2 совпадает с IMEI1",
  })

export type PhoneInput = z.input<typeof phoneSchema>
export type PhoneData = z.output<typeof phoneSchema>

export const saleSchema = z
  .object({
    salePrice: money("Укажите цену продажи"),
    soldAt: reqDate("Укажите дату продажи"),
    buyerName: optText(100),
    buyerPhone: optText(50),
    /** «В долг» — покупатель заплатит потом (можно с предоплатой) */
    paymentMethod: saleMethodEnum,
    /** предоплата при продаже в долг */
    paidNow: optMoney(),
    /** чем внесена предоплата */
    prepayMethod: paymentMethodEnum.optional().default("CASH"),
    /** до какого числа обещал вернуть долг */
    dueDate: optDate(),
    note: optText(1000),
  })
  .superRefine((d, ctx) => {
    if (d.paymentMethod !== "DEBT") return
    if (d.paidNow >= d.salePrice)
      ctx.addIssue({ code: "custom", path: ["paidNow"], message: "Это вся сумма — выберите способ оплаты, а не «В долг»" })
    // должника нужно найти
    if (!d.buyerName) ctx.addIssue({ code: "custom", path: ["buyerName"], message: "Для долга укажите покупателя" })
    if (d.dueDate && d.dueDate < d.soldAt)
      ctx.addIssue({ code: "custom", path: ["dueDate"], message: "Срок раньше даты продажи" })
  })

export type SaleInput = z.input<typeof saleSchema>
export type SaleData = z.output<typeof saleSchema>


/** Оплата долга по продаже */
export const salePaymentSchema = z.object({
  amount: money("Укажите сумму").refine((v) => v > 0, "Сумма должна быть больше нуля"),
  paidAt: reqDate("Укажите дату оплаты"),
  method: paymentMethodEnum,
  note: optText(500),
  /** новый срок для остатка долга (если оплатил не всё) */
  dueDate: optDate(),
})

export type SalePaymentInput = z.input<typeof salePaymentSchema>
