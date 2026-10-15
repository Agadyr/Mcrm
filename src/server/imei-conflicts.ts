import "server-only"
import type { PhoneStatus, Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { phoneTitle } from "@/lib/format"

export type ImeiConflict = {
  imei: string
  phoneId: string
  title: string
  status: PhoneStatus
}

/** Ищет телефоны владельца, у которых IMEI1 или IMEI2 совпадает с любым из переданных IMEI */
export async function findImeiConflicts(
  imeis: (string | null | undefined)[],
  ownerId: string,
  excludeId?: string | null,
  db: Prisma.TransactionClient = prisma
): Promise<ImeiConflict[]> {
  const list = [...new Set(imeis.filter((v): v is string => !!v))]
  if (list.length === 0) return []
  const phones = await db.phone.findMany({
    where: {
      ownerId,
      OR: [{ imei1: { in: list } }, { imei2: { in: list } }],
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
    select: { id: true, model: true, memoryGb: true, color: true, imei1: true, imei2: true, status: true },
  })
  const out: ImeiConflict[] = []
  for (const imei of list) {
    const p = phones.find((x) => x.imei1 === imei || x.imei2 === imei)
    if (p) out.push({ imei, phoneId: p.id, title: phoneTitle(p), status: p.status })
  }
  return out
}

export function conflictMessage(c: ImeiConflict) {
  return `IMEI ${c.imei} уже записан: ${c.title}`
}
