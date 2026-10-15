import { expect, test } from "@playwright/test"
import { PrismaClient } from "@prisma/client"
import { e2eEnv } from "../../playwright.config"
import { ADMIN, login, makeImei } from "./fixtures"

test.beforeAll(async () => {
  // две продажи и одна верификация за последние дни
  const db = new PrismaClient({ datasourceUrl: e2eEnv.DATABASE_URL })
  try {
    const owner = await db.user.findUniqueOrThrow({ where: { login: ADMIN.login } })
    const day = (back: number) => {
      const d = new Date()
      d.setUTCHours(0, 0, 0, 0)
      d.setUTCDate(d.getUTCDate() - back)
      return d
    }
    const agent = await db.user.upsert({ where: { login: "e2e-agent" }, update: {}, create: { login: "e2e-agent", name: "Айдос", role: "VERIFIER", passwordHash: "x" } })
    for (const [i, back] of [3, 1].entries()) {
      const phone = await db.phone.create({
        data: { ownerId: owner.id, model: `Тест-${i}`, imei1: makeImei(777000 + i), purchasePrice: 100_000, receivedAt: day(back + 2), supplier: "Поставщик-А", status: "SOLD" },
      })
      await db.sale.create({ data: { phoneId: phone.id, salePrice: 150_000, paidAmount: 150_000, soldAt: day(back), paymentMethod: "CASH" } })
      if (i === 0) {
        await db.verification.create({
          data: { ownerId: owner.id, phoneId: phone.id, phoneModel: phone.model, imei1: phone.imei1, agentId: agent.id, agentFee: 25_000, handedAt: day(back), status: "VERIFIED", completedAt: day(back - 1 < 0 ? 0 : back - 1) },
        })
      }
    }
  } finally {
    await db.$disconnect()
  }
})

test("аналитика: цифры, таблицы, выбор периода", async ({ page }) => {
  await login(page)
  await page.goto("/analytics?range=7d")
  await expect(page.getByRole("heading", { name: "Аналитика" })).toBeVisible()

  // главные цифры периода
  const revenue = page.getByText("Выручка", { exact: true }).first().locator("..")
  await expect(revenue).toContainText("300 000")
  await expect(page.getByText("Верифицировано", { exact: true }).first().locator("..")).toContainText("1 шт.")
  await expect(page.getByRole("link", { name: "Айдос" })).toBeVisible()

  // таблица моделей с итогом
  await expect(page.getByRole("cell", { name: "Итого" }).first()).toBeVisible()
  await expect(page.getByRole("table").filter({ hasText: "Модель" })).toContainText("300 000")

  // свой период без данных
  await page.goto("/analytics?from=2020-01-01&to=2020-01-31")
  await expect(page.getByText("За выбранный период нет продаж")).toBeVisible()
  // периоды — во всплывающей панели под кнопкой
  await page.getByText("Свой период", { exact: true }).first().click()
  await page.getByRole("link", { name: "30 дней" }).click()
  await expect(page).toHaveURL(/range=30d/)
  await expect(page.getByRole("link", { name: "30 дней" })).toHaveAttribute("aria-current", "page")
})
