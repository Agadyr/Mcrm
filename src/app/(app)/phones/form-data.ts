import "server-only"
import { prisma } from "@/lib/db"

/** Подсказки для формы: ранее использованные модели и поставщики */
export async function getPhoneFormHints(ownerId: string) {
  const [models, suppliers] = await Promise.all([
    prisma.phone.findMany({ where: { ownerId }, distinct: ["model"], select: { model: true }, orderBy: { model: "asc" } }),
    prisma.phone.findMany({
      distinct: ["supplier"],
      where: { ownerId, supplier: { not: null } },
      select: { supplier: true },
      orderBy: { supplier: "asc" },
    }),
  ])
  return { models: models.map((m) => m.model), suppliers: suppliers.map((s) => s.supplier!) }
}
