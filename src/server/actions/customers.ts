"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { requireUser } from "@/lib/auth"
import { fieldErrorsOf, type ActionResult } from "@/lib/validators/common"
import { customerSchema } from "@/lib/validators/customer"
import { customerSearchWhere } from "@/server/customers"

export type CustomerSuggestion = { id: string; name: string; phone: string | null }

/** Подсказки для полей «Покупатель» и «Телефон покупателя» при продаже */
export async function searchCustomersAction(q: string): Promise<CustomerSuggestion[]> {
  const user = await requireUser()
  // у верификатора нет склада и продаж
  if (user.role === "VERIFIER") return []
  const where = customerSearchWhere(String(q ?? "").slice(0, 100))
  if (!where) return []
  return prisma.customer.findMany({
    where: { ownerId: user.id, ...where },
    select: { id: true, name: true, phone: true },
    orderBy: { updatedAt: "desc" },
    take: 8,
  })
}

/** Имя и заметка клиента */
export async function updateCustomerAction(id: string, input: unknown): Promise<ActionResult> {
  const user = await requireUser()
  const parsed = customerSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Проверьте поля формы", fieldErrors: fieldErrorsOf(parsed.error) }
  const { count } = await prisma.customer.updateMany({ where: { id, ownerId: user.id }, data: parsed.data })
  if (!count) return { ok: false, error: "Клиент не найден" }
  revalidatePath("/", "layout")
  return { ok: true, data: undefined }
}
