/** Убирает пробелы, дефисы и прочие разделители */
export function normalizeImei(value: string | null | undefined): string {
  return (value ?? "").replace(/[\s\-_.\/]/g, "")
}

/** Проверка контрольной цифры по алгоритму Луна */
export function luhnValid(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false
  let sum = 0
  for (let i = 0; i < digits.length; i++) {
    let n = Number(digits[digits.length - 1 - i])
    if (i % 2 === 1) {
      n *= 2
      if (n > 9) n -= 9
    }
    sum += n
  }
  return sum % 10 === 0
}

/** Контрольная цифра для 14 первых цифр (используется в seed) */
export function luhnCheckDigit(first14: string): string {
  for (let d = 0; d <= 9; d++) if (luhnValid(first14 + d)) return String(d)
  return "0"
}

/** Предупреждение по IMEI (не блокирует сохранение) или null, если всё в порядке */
export function imeiWarning(value: string | null | undefined): string | null {
  const imei = normalizeImei(value)
  if (!imei) return null
  if (!/^\d+$/.test(imei)) return "IMEI должен состоять только из цифр"
  if (imei.length !== 15) return `IMEI должен содержать 15 цифр (сейчас ${imei.length})`
  if (!luhnValid(imei)) return "Не сходится контрольная цифра (алгоритм Луна) — проверьте IMEI"
  return null
}
