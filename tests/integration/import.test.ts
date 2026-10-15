import ExcelJS from "exceljs"
import { describe, expect, it } from "vitest"
import { prisma } from "@/lib/db"
import { guessMapping } from "@/lib/import-fields"
import { commitImportAction, parseImportFileAction } from "@/server/actions/import"
import { createPhone, createUser, loginAs, makeImei } from "../support/factories"

async function xlsx(rows: unknown[][]) {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet("Склад")
  rows.forEach((r) => ws.addRow(r))
  const buffer = await wb.xlsx.writeBuffer()
  const form = new FormData()
  form.set("file", new File([buffer], "phones.xlsx"))
  return form
}

describe("импорт из Excel", () => {
  it("читает файл, создаёт телефоны и продажи, пропускает дубли", async () => {
    const user = await createUser()
    await loginAs(user)
    const existing = await createPhone(user.id)
    const [a, b] = [makeImei(), makeImei()]

    const parsed = await parseImportFileAction(
      await xlsx([
        ["Отчёт за октябрь"], // строка-заголовок отчёта с одной ячейкой пропускается
        ["Модель", "IMEI", "Память", "Закупка", "Дата", "Цена продажи", "Покупатель", "Статус"],
        ["iPhone 15", a, "128 ГБ", "400 000", "01.10.2026", "", "", "в наличии"],
        ["iPhone 14", b, "1 ТБ", 300000, new Date("2026-10-02T00:00:00Z"), 350000, "Ержан", "продан"],
        ["iPhone 13", existing.imei1, "", "1", "", "", "", ""],
        ["", "", "", "", "", "", "", ""],
        ["iPhone 12", a, "", "1", "", "", "", ""],
      ])
    )
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const sheet = parsed.data[0]
    expect(sheet.rows).toHaveLength(4)
    expect(sheet.rowNumbers).toEqual([3, 4, 5, 7])

    const r = await commitImportAction({ rows: sheet.rows, mapping: guessMapping(sheet.headers), rowNumbers: sheet.rowNumbers })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.created).toBe(2)
    expect(r.data.skipped.map((s) => s.row)).toEqual([5, 7])
    expect(r.data.skipped[0].reason).toContain("уже есть в базе")
    expect(r.data.skipped[1].reason).toContain("повторяется в файле (строка 3)")

    const sold = await prisma.phone.findFirstOrThrow({ where: { imei1: b }, include: { sales: true } })
    expect(sold).toMatchObject({ status: "SOLD", memoryGb: 1024, purchasePrice: 300_000 })
    expect(sold.sales[0]).toMatchObject({ salePrice: 350_000, buyerName: "Ержан", paidAmount: 350_000 })
    const stock = await prisma.phone.findFirstOrThrow({ where: { imei1: a } })
    expect(stock.receivedAt.toISOString().slice(0, 10)).toBe("2026-10-01")
  })

  it("отклоняет не-xlsx", async () => {
    await loginAs(await createUser())
    const form = new FormData()
    form.set("file", new File(["a,b"], "phones.csv"))
    expect(await parseImportFileAction(form)).toMatchObject({ ok: false })
  })
})
