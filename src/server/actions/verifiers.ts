"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { requireUser } from "@/lib/auth"
import { fieldErrorsOf, type ActionResult } from "@/lib/validators/common"
import { verifierSchema } from "@/lib/validators/verification"

export async function saveVerifierAction(id: string | null, input: unknown): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser()
  const parsed = verifierSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Проверьте поля", fieldErrors: fieldErrorsOf(parsed.error) }
  if (id) {
    const { count } = await prisma.verifier.updateMany({ where: { id, ownerId: user.id }, data: parsed.data })
    if (count === 0) return { ok: false, error: "Человек не найден" }
  }
  const verifierId = id ?? (await prisma.verifier.create({ data: { ...parsed.data, ownerId: user.id } })).id
  revalidatePath("/", "layout")
  return { ok: true, data: { id: verifierId } }
}

export async function deleteVerifierAction(id: string): Promise<ActionResult> {
  const user = await requireUser()
  const verifier = await prisma.verifier.findFirst({ where: { id, ownerId: user.id }, select: { id: true } })
  if (!verifier) return { ok: false, error: "Человек не найден" }
  const count = await prisma.verification.count({ where: { verifierId: id } })
  if (count > 0) {
    return { ok: false, error: `Нельзя удалить: у человека ${count} верификаций. Сначала удалите их.` }
  }
  await prisma.verifier.delete({ where: { id } })
  revalidatePath("/", "layout")
  return { ok: true, data: undefined }
}
