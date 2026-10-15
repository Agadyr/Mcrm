import "server-only"
import ExcelJS from "exceljs"
import type { PaymentMethod, PhoneCondition, PhoneStatus } from "@prisma/client"
import { todayYmd } from "@/lib/dates"
import { imeiWarning, normalizeImei } from "@/lib/imei"
import type { ImportFieldKey, ImportMapping } from "@/lib/import-fields"
import { phoneSchema, saleSchema, type PhoneData, type SaleData } from "@/lib/validators/phone"
import { prisma } from "@/lib/db"
import { phoneTitle } from "@/lib/format"

export const MAX_IMPORT_ROWS = 5000

export type ParsedSheet = { name: string; headers: string[]; rows: string[][]; rowNumbers: number[] }

function cellToString(value: ExcelJS.CellValue): string {
  if (value == null) return ""
  if (value instanceof Date) {
    // Excel хранит даты без зоны — берём календарный день как есть
    return value.toISOString().slice(0, 10)
  }
  if (typeof value === "number") {
    return Number.isInteger(value) ? value.toFixed(0) : String(value)
  }
  if (typeof value === "boolean") return value ? "да" : "нет"
  if (typeof value === "object") {
    if ("result" in value) return cellToString(value.result as ExcelJS.CellValue)
    if ("richText" in value) return value.richText.map((r) => r.text).join("")
    if ("text" in value) return String(value.text)
    if ("error" in value) return ""
  }
  return String(value).trim()
}

export async function parseWorkbook(buffer: ArrayBuffer): Promise<ParsedSheet[]> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer)
  const sheets: ParsedSheet[] = []
  wb.eachSheet((ws) => {
    const all: { n: number; values: string[] }[] = []
    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      const values: string[] = []
      for (let c = 1; c <= ws.columnCount; c++) values.push(cellToString(row.getCell(c).value).trim())
      if (values.some(Boolean)) all.push({ n: rowNumber, values })
    })
    // строка заголовков — первая, где заполнено хотя бы 2 ячейки
    const headerIdx = all.findIndex((r) => r.values.filter(Boolean).length >= 2)
    if (headerIdx < 0) return
    const body = all.slice(headerIdx + 1)
    sheets.push({
      name: ws.name,
      headers: all[headerIdx].values,
      rows: body.map((r) => r.values),
      rowNumbers: body.map((r) => r.n),
    })
  })
  return sheets
}

// ───────── Разбор значений ─────────

function parseMemory(v: string): string {
  if (!v) return ""
  const m = v.replace(",", ".").match(/(\d+(?:\.\d+)?)\s*(тб|tb|т|t)?/i)
  if (!m) return ""
  const n = Number(m[1])
  return String(m[2] ? Math.round(n * 1024) : Math.round(n))
}

function parseMoneyValue(v: string): string {
  if (!v) return ""
  const cleaned = v.replace(/[\s ₸тг]/gi, "").replace(",", ".")
  const n = Number(cleaned)
  return Number.isFinite(n) ? String(Math.round(n)) : v
}

function parseDateValue(v: string): string {
  if (!v) return ""
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v
  const m = v.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/)
  if (m) {
    const year = m[3].length === 2 ? `20${m[3]}` : m[3]
    return `${year}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`
  }
  // число дней Excel (если ячейка не распознана как дата)
  if (/^\d{5}$/.test(v)) {
    const d = new Date(Date.UTC(1899, 11, 30) + Number(v) * 86_400_000)
    return d.toISOString().slice(0, 10)
  }
  return v
}

function parseCondition(v: string): PhoneCondition {
  const s = v.toLowerCase()
  return /б\/?у|used|бу|ношен/.test(s) ? "USED" : "NEW"
}

function parseStatus(v: string): PhoneStatus | null {
  const s = v.toLowerCase()
  if (!s) return null
  if (s.includes("прод")) return "SOLD"
  if (s.includes("вериф")) return "ON_VERIFICATION"
  if (s.includes("резерв") || s.includes("брон")) return "RESERVED"
  if (s.includes("возв")) return "RETURNED"
  if (s.includes("налич") || s.includes("склад")) return "IN_STOCK"
  return null
}

function parsePayment(v: string): PaymentMethod {
  const s = v.toLowerCase()
  if (s.includes("kaspi") || s.includes("каспи")) return "KASPI"
  if (s.includes("перев") || s.includes("transfer")) return "TRANSFER"
  if (s.includes("рассроч") || s.includes("кредит")) return "INSTALLMENT"
  if (s.includes("долг")) return "DEBT"
  return "CASH"
}

// ───────── Проверка строк ─────────

export type RowCheck = {
  row: number // номер строки в файле (для пользователя)
  state: "ok" | "warning" | "error" | "duplicate"
  messages: string[]
  preview: { model: string; imei1: string; imei2: string; purchasePrice: string; status: string }
  phone?: PhoneData
  sale?: SaleData
}

export async function checkRows(
  rows: string[][],
  mapping: ImportMapping,
  rowNumbers: number[],
  ownerId: string
): Promise<RowCheck[]> {
  const get = (r: string[], key: ImportFieldKey) => {
    const idx = mapping[key]
    return idx === undefined ? "" : (r[idx] ?? "").trim()
  }

  const results: RowCheck[] = rows.map((r, i) => {
    const messages: string[] = []
    const salePriceRaw = parseMoneyValue(get(r, "salePrice"))
    const hasSale = !!salePriceRaw && salePriceRaw !== "0"
    const statusFromFile = parseStatus(get(r, "status"))
    let status: PhoneStatus = statusFromFile ?? "IN_STOCK"
    if (hasSale) status = "SOLD"

    const raw = {
      model: get(r, "model"),
      memoryGb: parseMemory(get(r, "memory")),
      color: get(r, "color"),
      imei1: normalizeImei(get(r, "imei1")),
      imei2: normalizeImei(get(r, "imei2")),
      serialNumber: get(r, "serialNumber"),
      condition: parseCondition(get(r, "condition")),
      purchasePrice: parseMoneyValue(get(r, "purchasePrice")) || "0",
      receivedAt: parseDateValue(get(r, "receivedAt")) || todayYmd(),
      supplier: get(r, "supplier"),
      note: get(r, "note"),
      status,
    }
    const preview = {
      model: raw.model,
      imei1: raw.imei1,
      imei2: raw.imei2,
      purchasePrice: raw.purchasePrice,
      status,
    }

    const parsed = phoneSchema.safeParse(raw)
    if (!parsed.success) {
      for (const issue of parsed.error.issues) messages.push(issue.message)
      return { row: rowNumbers[i] ?? i + 2, state: "error", messages, preview }
    }

    let sale: SaleData | undefined
    if (status === "SOLD") {
      if (!hasSale) {
        messages.push("Статус «Продан», но нет цены продажи — укажите колонку «Цена продажи»")
        return { row: rowNumbers[i] ?? i + 2, state: "error", messages, preview }
      }
      const s = saleSchema.safeParse({
        salePrice: salePriceRaw,
        soldAt: parseDateValue(get(r, "soldAt")) || raw.receivedAt,
        buyerName: get(r, "buyerName"),
        buyerPhone: get(r, "buyerPhone"),
        paymentMethod: parsePayment(get(r, "paymentMethod")),
        note: "",
      })
      if (!s.success) {
        for (const issue of s.error.issues) messages.push(`Продажа: ${issue.message}`)
        return { row: rowNumbers[i] ?? i + 2, state: "error", messages, preview }
      }
      sale = s.data
      if (!get(r, "soldAt")) messages.push("Нет даты продажи — взята дата поступления")
    }
    if (get(r, "status") && !statusFromFile) messages.push(`Статус «${get(r, "status")}» не распознан — «В наличии»`)
    const w1 = imeiWarning(parsed.data.imei1)
    const w2 = imeiWarning(parsed.data.imei2)
    if (w1) messages.push(`IMEI1: ${w1}`)
    if (w2) messages.push(`IMEI2: ${w2}`)

    return {
      row: rowNumbers[i] ?? i + 2,
      state: messages.length ? "warning" : "ok",
      messages,
      preview,
      phone: parsed.data,
      sale,
    }
  })

  // Дубли внутри файла
  const seen = new Map<string, number>()
  for (const r of results) {
    if (!r.phone) continue
    for (const imei of [r.phone.imei1, r.phone.imei2]) {
      if (!imei) continue
      const first = seen.get(imei)
      if (first !== undefined) {
        r.state = "duplicate"
        r.messages.unshift(`IMEI ${imei} повторяется в файле (строка ${first})`)
      } else seen.set(imei, r.row)
    }
  }

  // Дубли в базе
  const allImeis = [...seen.keys()]
  const existing = new Map<string, string>()
  for (let i = 0; i < allImeis.length; i += 1000) {
    const chunk = allImeis.slice(i, i + 1000)
    const phones = await prisma.phone.findMany({
      where: { ownerId, OR: [{ imei1: { in: chunk } }, { imei2: { in: chunk } }] },
      select: { model: true, memoryGb: true, color: true, imei1: true, imei2: true },
    })
    for (const p of phones) {
      existing.set(p.imei1, phoneTitle(p))
      if (p.imei2) existing.set(p.imei2, phoneTitle(p))
    }
  }
  for (const r of results) {
    if (!r.phone) continue
    for (const imei of [r.phone.imei1, r.phone.imei2]) {
      if (imei && existing.has(imei)) {
        r.state = "duplicate"
        r.messages.unshift(`IMEI ${imei} уже есть в базе: ${existing.get(imei)}`)
      }
    }
  }

  return results
}
