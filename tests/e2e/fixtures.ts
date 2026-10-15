import { expect, type Page } from "@playwright/test"

export const ADMIN = { login: "e2e-admin", password: "e2e-pass-123" }

/** Войти. Если уже на странице входа (например, с ?next=), остаёмся на ней. */
export async function login(page: Page, user = ADMIN) {
  if (!new URL(page.url(), "http://x").pathname.startsWith("/login")) await page.goto("/login")
  await page.getByLabel("Логин").fill(user.login)
  await page.getByLabel("Пароль").fill(user.password)
  await page.getByRole("button", { name: "Войти" }).click()
  await expect(page).not.toHaveURL(/\/login/)
}

/** IMEI с верной контрольной цифрой (алгоритм Луна) */
export function makeImei(seed = Date.now()) {
  const first14 = ("35" + String(seed)).slice(0, 14).padEnd(14, "7")
  for (let d = 0; d <= 9; d++) {
    const s = first14 + d
    let sum = 0
    for (let i = 0; i < 15; i++) {
      let n = Number(s[14 - i])
      if (i % 2) n = n * 2 > 9 ? n * 2 - 9 : n * 2
      sum += n
    }
    if (sum % 10 === 0) return s
  }
  throw new Error("unreachable")
}
