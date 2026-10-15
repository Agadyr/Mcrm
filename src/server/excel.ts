import "server-only"
import ExcelJS from "exceljs"
import { todayYmd } from "@/lib/dates"

export type Column = {
  header: string
  key: string
  width?: number
  type?: "text" | "money" | "date" | "number"
}

const MONEY_FMT = '#,##0 "₸"'
const DATE_FMT = "dd.mm.yyyy"

/** Лист с шапкой, фильтром, закреплённой первой строкой и форматами колонок */
export function addSheet(
  wb: ExcelJS.Workbook,
  name: string,
  columns: Column[],
  rows: Record<string, unknown>[]
) {
  const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] })
  ws.columns = columns.map((c) => ({
    header: c.header,
    key: c.key,
    width: c.width ?? 14,
    style:
      c.type === "money"
        ? { numFmt: MONEY_FMT }
        : c.type === "date"
          ? { numFmt: DATE_FMT }
          : c.type === "text"
            ? { numFmt: "@" } // IMEI как текст, без «3,57E+14»
            : {},
  }))
  for (const row of rows) ws.addRow(row)

  const header = ws.getRow(1)
  header.font = { bold: true }
  header.alignment = { vertical: "middle", wrapText: true }
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F1F1" } }
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } }
  return ws
}

export async function xlsxResponse(wb: ExcelJS.Workbook, baseName: string, asciiName: string) {
  const buffer = await wb.xlsx.writeBuffer()
  const date = todayYmd()
  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${asciiName}_${date}.xlsx"; filename*=UTF-8''${encodeURIComponent(`${baseName}_${date}.xlsx`)}`,
      "Cache-Control": "no-store",
    },
  })
}

export function newWorkbook() {
  const wb = new ExcelJS.Workbook()
  wb.creator = "Учёт телефонов"
  wb.created = new Date()
  return wb
}
