import { expect, test } from "@playwright/test"
import { ADMIN, login } from "./fixtures"

test("без входа — страница логина, после входа — главная", async ({ page }) => {
  await page.goto("/phones")
  await expect(page).toHaveURL(/\/login\?next=%2Fphones/)
  await login(page)
  await expect(page).toHaveURL(/\/phones$/)
  await expect(page.getByRole("heading", { name: "Товары" })).toBeVisible()
})

test("неверный пароль — понятная ошибка", async ({ page }) => {
  await page.goto("/login")
  await page.getByLabel("Логин").fill(ADMIN.login)
  await page.getByLabel("Пароль").fill("wrong-password")
  await page.getByRole("button", { name: "Войти" }).click()
  await expect(page.getByText("Неверный логин или пароль")).toBeVisible()
})

test("API без входа отвечает 401", async ({ request }) => {
  const res = await request.get("/api/export/phones")
  expect(res.status()).toBe(401)
})

test("manifest и иконки доступны без входа (установка на телефон)", async ({ request }) => {
  expect((await request.get("/manifest.webmanifest")).ok()).toBe(true)
  expect((await request.get("/icons/192")).ok()).toBe(true)
})
