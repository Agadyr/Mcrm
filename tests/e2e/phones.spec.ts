import { expect, test } from "@playwright/test"
import { login, makeImei } from "./fixtures"

test("добавить телефон, поймать дубль IMEI и продать в долг", async ({ page }) => {
  const imei = makeImei()
  await login(page)

  await page.goto("/phones/new")
  await page.getByLabel("Модель").fill("iPhone 15 Pro")
  await page.getByLabel("IMEI1").fill(imei)
  await page.getByLabel("Цена закупки").fill("450000")
  await page.getByLabel("Поставщик").fill("Алмас")
  await page.getByRole("button", { name: "Добавить телефон" }).click()

  await expect(page).toHaveURL(/\/phones\/[a-z0-9]+$/)
  await expect(page.getByText(imei).first()).toBeVisible()
  await expect(page.getByText("Поступил на склад от «Алмас», закупка 450 000 ₸")).toBeVisible()

  // дубль IMEI форма не пропускает
  await page.goto("/phones/new")
  await page.getByLabel("IMEI1").fill(imei)
  await expect(page.getByText("Этот IMEI уже записан")).toBeVisible()

  await page.goBack()
  await page.getByRole("button", { name: "Продать" }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("Цена продажи").fill("500000")
  await dialog.getByLabel("Способ оплаты").selectOption("DEBT")
  await dialog.getByLabel("Предоплата").fill("100000")
  await dialog.getByRole("button", { name: "Через неделю" }).click()
  await dialog.getByLabel("Покупатель").fill("Ержан")
  await expect(dialog.getByText("Прибыль")).toBeVisible()
  await dialog.getByRole("button", { name: "Сохранить продажу" }).click()
  await expect(page.getByText("Продажа сохранена, долг 400 000 ₸")).toBeVisible()

  await page.goto("/sales?state=debt")
  await expect(page.getByText("Ержан").first()).toBeVisible()
})
