import { luhnValid } from "./imei"

// Разбор штрихкодов с коробки телефона. На наклейке обычно: IMEI1, IMEI2, серийный номер (S/N),
// а также лишние коды — EID (32 цифры), UPC/EAN (12–13 цифр), артикул. Берём только нужное.

/** Найденный на кадре/фото штрихкод: текст, центр и поворот (как прочитал ZXing) */
export type Detected = { text: string; cx: number; cy: number; orientation: number }

/** IMEI — ровно 15 цифр с верной контрольной цифрой. EID (32 цифры) и товарные коды не подходят. */
export function extractImei(text: string): string | null {
  const d = text.replace(/\s/g, "")
  return /^\d{15}$/.test(d) && luhnValid(d) ? d : null
}

/** Серийный номер: латиница и цифры, 8–20 символов, не только цифры. */
export function extractSerial(text: string): string | null {
  const t = text.trim().toUpperCase()
  if (!/^[A-Z0-9]{8,20}$/.test(t) || /^\d+$/.test(t)) return null
  // у Apple в штрихкоде перед серийником стоит «S»: S + 10 или S + 12 символов («SC9D52RHY00» → «C9D52RHY00»)
  if (t.startsWith("S") && (t.length === 11 || t.length === 13)) return t.slice(1)
  return t
}

/**
 * Порядок IMEI на наклейке: левый — IMEI1, правый — IMEI2; если в одной колонке — верхний первый.
 * Так у Apple (IMEI/MEID слева, IMEI2 справа) и у Samsung (IMEI 1 слева, IMEI 2 справа).
 * Если коробку повернули, координаты возвращаем в «ровное» положение по углу штрихкода.
 */
export function orderImeis(items: Detected[], width: number, height: number): string[] {
  if (items.length < 2) return items.map((i) => i.text)
  const angle = items[0].orientation
  const rad = (-angle * Math.PI) / 180
  const pts = items.map((i) => {
    const x = i.cx - width / 2
    const y = i.cy - height / 2
    return { text: i.text, x: x * Math.cos(rad) - y * Math.sin(rad), y: x * Math.sin(rad) + y * Math.cos(rad) }
  })
  const column = Math.max(width, height) * 0.12 // ближе по горизонтали — считаем одной колонкой
  pts.sort((a, b) => (Math.abs(a.x - b.x) > column ? a.x - b.x : a.y - b.y))
  return pts.map((p) => p.text)
}

/** Собирает IMEI1, IMEI2 и серийник с нескольких кадров */
export class BoxCollector {
  imeis: string[] = []
  serial: string | null = null
  /** порядок IMEI, увиденный на одном кадре вместе — надёжнее, чем порядок обнаружения */
  private framed: string[] | null = null

  /** Добавить штрихкоды одного кадра. Возвращает true, если появилось что-то новое. */
  add(frame: Detected[], width: number, height: number, wantSerial: boolean): boolean {
    let changed = false
    const frameImeis: Detected[] = []
    for (const d of frame) {
      const imei = extractImei(d.text)
      if (imei) {
        if (!frameImeis.some((f) => f.text === imei)) frameImeis.push({ ...d, text: imei })
        if (!this.imeis.includes(imei) && this.imeis.length < 2) {
          this.imeis.push(imei)
          changed = true
        }
        continue
      }
      if (wantSerial && !this.serial) {
        const s = extractSerial(d.text)
        if (s) {
          this.serial = s
          changed = true
        }
      }
    }
    if (frameImeis.length >= 2) {
      const ordered = orderImeis(frameImeis.slice(0, 2), width, height)
      if (ordered.join() !== this.framed?.join()) changed = true
      this.framed = ordered
    }
    return changed
  }

  /** [IMEI1, IMEI2] в правильном порядке */
  ordered(): string[] {
    if (this.framed && this.imeis.every((i) => this.framed!.includes(i))) return [...this.framed]
    return [...this.imeis]
  }

  /** Поменять IMEI1 и IMEI2 местами (если на наклейке другой порядок) */
  swap() {
    const [a, b] = this.ordered()
    if (!b) return
    this.framed = [b, a]
    this.imeis = [b, a]
  }
}
