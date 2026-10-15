"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { requireUser } from "@/lib/auth"
import { fieldErrorsOf, type ActionResult } from "@/lib/validators/common"
import { profileSchema } from "@/lib/validators/user"

export async function updateProfileAction(input: unknown): Promise<ActionResult> {
  const user = await requireUser()
  const parsed = profileSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Проверьте поля", fieldErrors: fieldErrorsOf(parsed.error) }
  if (user.role !== "VERIFIER" && !parsed.data.companyName) {
    return { ok: false, error: "Проверьте поля", fieldErrors: { companyName: "Укажите название компании" } }
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { ...parsed.data, companyName: parsed.data.companyName || null },
  })
  revalidatePath("/", "layout")
  return { ok: true, data: undefined }
}
