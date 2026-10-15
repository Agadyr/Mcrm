import { money } from "@/lib/validators/common"

// Разбор того, что человек пишет в чат

/** Сумма: «450000», «450 000», «450к», «1,2 млн» → тенге */
export function parseMoney(text: string): number | null {
  const t = text.trim().toLowerCase().replace(/\s+/g, " ")
  const short = t.match(/^(\d+(?:[.,]\d+)?)\s*(к|k|тыс\.?|млн|m)$/)
  if (short) {
    const n = Number(short[1].replace(",", "."))
    const mult = short[2].startsWith("м") || short[2] === "m" ? 1_000_000 : 1000
    return Math.round(n * mult)
  }
  const r = money().safeParse(t)
  return r.success ? r.data : null
}

/**
 * IMEI из сообщения: числа по 8–17 цифр через пробел, запятую или с новой строки («IMEI1 IMEI2» одним сообщением).
 * Если так не нашлось — один IMEI, записанный группами цифр («35 678900 001004 9»).
 */
export function extractImeis(text: string): string[] {
  const tokens = text
    .split(/[\s,;]+/)
    .map((t) => t.replace(/[^\d]/g, ""))
    .filter((t) => t.length >= 8 && t.length <= 17)
  if (tokens.length) return tokens
  const all = text.replace(/[^\d]/g, "")
  return all.length >= 14 && all.length <= 17 ? [all] : []
}

/** «Похоже на IMEI»: 15 цифр (для поиска без нажатия кнопок) */
export const looksLikeImei = (text: string) => /^\d{15}$/.test(text.replace(/[\s-]/g, ""))

/** Данные телефона, найденные в одном сообщении */
export type PhoneFields = {
  model?: string
  imei1?: string
  imei2?: string
  serialNumber?: string
  memoryGb?: number
  condition?: "NEW" | "USED"
  purchasePrice?: number
  supplier?: string
}

const MEMORY_GB = [32, 64, 128, 256, 512, 1024, 2048]

/** «256», «256gb», «256 ГБ», «1TB», «1 ТБ» → ГБ */
export function parseMemory(text: string): number | null {
  const m = text.trim().match(/^(\d{1,4})\s*(gb|гб|g|tb|тб|t)?$/i)
  if (!m) return null
  const n = Number(m[1]) * (/^[tт]/i.test(m[2] ?? "") ? 1024 : 1)
  return MEMORY_GB.includes(n) ? n : null
}

const LABEL =
  /^\s*(imei\s*-?\s*1|имей\s*-?\s*1|imei\s*-?\s*2|имей\s*-?\s*2|imei|имей|s\s*\/\s*n|sn|serial(?:\s*number)?|серийн\S*(?:\s*номер)?|с\s*\/\s*н|модель|model|цена|закуп\S*|price|память|memory|поставщик|supplier|состояние)\s*[:=\-–—]?\s*(.+)$/i

const CONDITION_USED = /^(б\/у|бу|б\.у\.?|used)$/i
const CONDITION_NEW = /^(новый|новая|new)$/i
const UNIT_WORDS = /^(gb|гб|tb|тб|₸|тг|тенге|imei\d?|имей\d?|s\/n|sn)$/i

/**
 * Разбор сообщения с данными телефона — с подписями («IMEI1: …», «S/N …», «Цена 450к») или без:
 * 15 цифр — IMEI (первый — IMEI1), буквы+цифры из 8–14 знаков — серийный номер, 64/128/256… — память,
 * сумма от 10 000 или «450к» — закупка, «б/у» — состояние, остальные слова — модель.
 */
export function parsePhoneText(text: string): PhoneFields {
  const out: PhoneFields = {}
  const imeis: string[] = []
  const slots: (string | undefined)[] = []
  const words: string[] = []

  // «450 000» → «450000», «450 к» → «450к»
  let t = text
  for (let i = 0; i < 3; i++) t = t.replace(/(\d{1,3}) (\d{3})(?!\d)/g, "$1$2")
  t = t.replace(/(\d)\s+(к|k|тыс\.?|млн|₸|тг)(?=\s|$)/gi, "$1$2")

  for (const raw of t.split(/\n/)) {
    const line = raw.trim()
    if (!line) continue
    const m = line.match(LABEL)
    if (m) {
      const label = m[1].toLowerCase().replace(/\s|-/g, "")
      const value = m[2].trim()
      if (/^(imei|имей)1$/.test(label)) slots[0] = value.replace(/\D/g, "")
      else if (/^(imei|имей)2$/.test(label)) slots[1] = value.replace(/\D/g, "")
      else if (/^(imei|имей)$/.test(label)) imeis.push(...extractImeis(value))
      else if (/^(s\/n|sn|serial|с\/н|серийн)/.test(label)) out.serialNumber = value.replace(/\s+/g, "").toUpperCase()
      else if (/^(модель|model)/.test(label)) out.model = value
      else if (/^(цена|закуп|price)/.test(label)) out.purchasePrice = parseMoney(value) ?? undefined
      else if (/^(память|memory)/.test(label)) out.memoryGb = parseMemory(value) ?? undefined
      else if (/^(поставщик|supplier)/.test(label)) out.supplier = value
      else if (label === "состояние") out.condition = CONDITION_USED.test(value) ? "USED" : "NEW"
      continue
    }
    for (const tok of line.split(/[\s,;]+/)) {
      const digits = tok.replace(/-/g, "")
      if (/^\d{14,17}$/.test(digits)) imeis.push(digits)
      else if (out.memoryGb == null && parseMemory(tok) != null) out.memoryGb = parseMemory(tok)!
      else if (out.purchasePrice == null && /^\d[\d.,]*(к|k|тыс\.?|млн|₸|тг)$/i.test(tok)) out.purchasePrice = parseMoney(tok) ?? undefined
      else if (out.purchasePrice == null && /^\d{5,10}$/.test(tok) && Number(tok) >= 10000) out.purchasePrice = Number(tok)
      else if (!out.serialNumber && /^(?=.*[a-z])(?=.*\d)[a-z0-9]{8,14}$/i.test(tok)) out.serialNumber = tok.toUpperCase()
      else if (CONDITION_USED.test(tok)) out.condition = "USED"
      else if (CONDITION_NEW.test(tok)) out.condition = "NEW"
      else if (!UNIT_WORDS.test(tok)) words.push(tok)
    }
  }

  const [i1, i2] = [slots[0] ?? imeis.shift(), slots[1] ?? imeis.shift()]
  if (i1) out.imei1 = i1
  if (i2) out.imei2 = i2
  const model = words.join(" ").trim()
  if (!out.model && /\p{L}/u.test(model) && model.length <= 100) out.model = model
  for (const k of Object.keys(out) as (keyof PhoneFields)[]) if (out[k] === undefined) delete out[k]
  return out
}
