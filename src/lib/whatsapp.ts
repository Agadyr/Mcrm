/** Номер для wa.me: только цифры, казахстанские «8 7xx…» → «7 7xx…». null, если номер не похож на телефон. */
export function waNumber(phone: string | null | undefined): string | null {
  let digits = (phone ?? "").replace(/\D/g, "")
  if (digits.length === 11 && digits.startsWith("8")) digits = "7" + digits.slice(1)
  if (digits.length === 10 && digits.startsWith("7")) digits = "7" + digits // 707 123 45 67 → 7707…
  return digits.length >= 10 ? digits : null
}

export function waLink(phone: string | null | undefined, text?: string): string | null {
  const n = waNumber(phone)
  if (!n) return null
  return `https://wa.me/${n}${text ? `?text=${encodeURIComponent(text)}` : ""}`
}

/** Текст с данными телефона для сообщения */
export function phoneText(p: { phoneModel: string; imei1: string; imei2?: string | null; serialNumber?: string | null }) {
  return [
    p.phoneModel,
    `IMEI1: ${p.imei1}`,
    p.imei2 ? `IMEI2: ${p.imei2}` : null,
    p.serialNumber ? `S/N: ${p.serialNumber}` : null,
  ]
    .filter(Boolean)
    .join("\n")
}
