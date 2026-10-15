import { formatDate, formatMoney } from "./format"

type DebtInfo = { buyerName: string | null; salePrice: number; paidAmount: number; dueDate: Date | null }

/** Напоминание покупателю о долге — текст для WhatsApp */
export function debtReminder(s: DebtInfo, model: string) {
  const debt = s.salePrice - s.paidAmount
  return (
    `Здравствуйте${s.buyerName ? `, ${s.buyerName}` : ""}! Напоминаем об оплате за ${model}: ` +
    `осталось ${formatMoney(debt)}${s.dueDate ? `, срок — ${formatDate(s.dueDate)}` : ""}.`
  )
}
