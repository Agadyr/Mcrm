"use server"

import { saleCreateData } from "@/server/sale-data"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { requireUser } from "@/lib/auth"
import { formatMoney } from "@/lib/format"
import type { ImportMapping } from "@/lib/import-fields"
import type { ActionResult } from "@/lib/validators/common"
import { checkRows, MAX_IMPORT_ROWS, parseWorkbook, type ParsedSheet, type RowCheck } from "@/server/import"

export async function parseImportFileAction(formData: FormData): Promise<ActionResult<ParsedSheet[]>> {
  await requireUser()
  const file = formData.get("file")
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Выберите файл" }
  if (!/\.xlsx$/i.test(file.name)) return { ok: false, error: "Нужен файл .xlsx (старый .xls сохраните как .xlsx)" }
  try {
    const sheets = await parseWorkbook(await file.arrayBuffer())
    if (sheets.length === 0) return { ok: false, error: "В файле нет данных" }
    for (const s of sheets) {
      if (s.rows.length > MAX_IMPORT_ROWS) {
        return { ok: false, error: `Слишком много строк на листе «${s.name}» (максимум ${MAX_IMPORT_ROWS})` }
      }
    }
    return { ok: true, data: sheets }
  } catch (e) {
    console.error(e)
    return { ok: false, error: "Не удалось прочитать файл. Проверьте, что это Excel .xlsx" }
  }
}

const payloadSchema = z.object({
  rows: z.array(z.array(z.string())).max(MAX_IMPORT_ROWS),
  mapping: z.record(z.string(), z.number().int().min(0)),
  rowNumbers: z.array(z.number().int().min(1)).max(MAX_IMPORT_ROWS),
})

type PreviewRow = Omit<RowCheck, "phone" | "sale">

export async function previewImportAction(input: unknown): Promise<ActionResult<PreviewRow[]>> {
  const user = await requireUser()
  const parsed = payloadSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Неверные данные" }
  const { rows, mapping, rowNumbers } = parsed.data
  if (mapping.model === undefined || mapping.imei1 === undefined) {
    return { ok: false, error: "Укажите колонки для «Модель» и «IMEI1»" }
  }
  const checks = await checkRows(rows, mapping as ImportMapping, rowNumbers, user.id)
  return { ok: true, data: checks.map((c) => ({ row: c.row, state: c.state, messages: c.messages, preview: c.preview })) }
}

export type ImportReport = {
  created: number
  skipped: { row: number; reason: string }[]
}

export async function commitImportAction(input: unknown): Promise<ActionResult<ImportReport>> {
  const user = await requireUser()
  const parsed = payloadSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Неверные данные" }
  const { rows, mapping, rowNumbers } = parsed.data
  if (mapping.model === undefined || mapping.imei1 === undefined) {
    return { ok: false, error: "Укажите колонки для «Модель» и «IMEI1»" }
  }

  // Проверяем заново на сервере — данные с клиента не доверенные
  const checks = await checkRows(rows, mapping as ImportMapping, rowNumbers, user.id)
  const report: ImportReport = { created: 0, skipped: [] }
  const toCreate = checks.filter((c) => {
    if ((c.state === "ok" || c.state === "warning") && c.phone) return true
    report.skipped.push({ row: c.row, reason: c.messages[0] ?? "Ошибка" })
    return false
  })

  const CHUNK = 200
  for (let i = 0; i < toCreate.length; i += CHUNK) {
    const chunk = toCreate.slice(i, i + CHUNK)
    try {
      await prisma.$transaction(
        async (tx) => {
          for (const c of chunk) {
            const phone = c.phone!
            await tx.phone.create({
              data: {
                ...phone,
                ownerId: user.id,
                events: {
                  create: {
                    type: "IMPORTED",
                    message: `Импортирован из Excel (строка ${c.row}), закупка ${formatMoney(phone.purchasePrice)}${c.sale ? `, продан за ${formatMoney(c.sale.salePrice)}` : ""}`,
                    userId: user.id,
                  },
                },
                ...(c.sale ? { sales: { create: saleCreateData(c.sale) } } : {}),
              },
            })
          }
        },
        { timeout: 60_000 }
      )
      report.created += chunk.length
    } catch (e) {
      console.error(e)
      for (const c of chunk) report.skipped.push({ row: c.row, reason: "Ошибка записи в базу (возможно, дубль IMEI)" })
    }
  }

  report.skipped.sort((a, b) => a.row - b.row)
  revalidatePath("/", "layout")
  return { ok: true, data: report }
}
