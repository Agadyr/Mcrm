import { expect, test } from "@playwright/test"
import { login } from "./fixtures"

test("верификатор регистрируется, администратор видит заявку", async ({ page }) => {
  const loginName = `ver${Date.now()}`
  await page.goto("/register")
  await page.getByLabel("Имя и фамилия").fill("Айдос Тестов")
  await page.getByLabel("Номер телефона").fill("+7 701 222 33 44")
  await page.getByLabel("Логин").fill(loginName)
  await page.locator("#password").fill("secret123")
  await page.getByLabel("Повторите пароль").fill("secret123")
  await page.getByRole("button", { name: /Отправить|Зарегистрироваться/ }).click()
  await expect(page.getByRole("heading", { name: "Заявка отправлена" })).toBeVisible()

  // до одобрения войти нельзя
  await page.goto("/login")
  await page.getByLabel("Логин").fill(loginName)
  await page.getByLabel("Пароль").fill("secret123")
  await page.getByRole("button", { name: "Войти" }).click()
  await expect(page.getByText(/на рассмотрении/)).toBeVisible()

  await page.context().clearCookies()
  await login(page)
  await page.goto("/users")
  await expect(page.getByText(loginName).first()).toBeVisible()
})
