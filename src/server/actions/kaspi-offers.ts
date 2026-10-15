"use server"

import { randomBytes } from "node:crypto"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { requireUser } from "@/lib/auth"
import { fieldErrorsOf, money, optInt, optText, reqText, type ActionResult } from "@/lib/validators/common"

// Прайс-лист Kaspi: настройки (ID магазина, склад, ссылка) и товары с ценами. Остатки считаются по складу сами.

function refresh() {
  revalidatePath("/kaspi", "layout")
}

async function companyShop() {
  const user = await requireUser()
  if (user.role === "VERIFIER") return null
  const shop = await prisma.kaspiShop.findUnique({ where: { ownerId: user.id } })
  return shop ? { user, shop } : null
}

const NO_SHOP: ActionResult<never> = { ok: false, error: "Сначала подключите Kaspi магазин" }

const settingsSchema = z.object({
  merchantId: reqText("Укажите ID магазина в Kaspi", 40).regex(/^[A-Za-z0-9_-]+$/, "ID — латинские буквы и цифры, как в кабинете Kaspi"),
  storeId: reqText("Укажите код склада", 40).regex(/^[A-Za-z0-9_-]+$/, "Код склада — латинские буквы и цифры, например PP1"),
})

/** Сохранить ID магазина и код склада; ссылка на прайс-лист создаётся при первом сохранении */
export async function saveKaspiFeedSettingsAction(input: unknown): Promise<ActionResult> {
  const ctx = await companyShop()
  if (!ctx) return NO_SHOP
  const parsed = settingsSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Проверьте поля", fieldErrors: fieldErrorsOf(parsed.error) }
  await prisma.kaspiShop.update({
    where: { id: ctx.shop.id },
    data: { ...parsed.data, feedToken: ctx.shop.feedToken ?? randomBytes(24).toString("base64url") },
  })
  refresh()
  return { ok: true, data: undefined }
}

/** Новая ссылка: старая перестанет работать (если ссылка попала не туда) */
export async function regenerateKaspiFeedAction(): Promise<ActionResult> {
  const ctx = await companyShop()
  if (!ctx) return NO_SHOP
  await prisma.kaspiShop.update({ where: { id: ctx.shop.id }, data: { feedToken: randomBytes(24).toString("base64url") } })
  refresh()
  return { ok: true, data: undefined }
}

const offerSchema = z.object({
  sku: reqText("Укажите артикул", 20).regex(/^[A-Za-z0-9_-]+$/, "Артикул — до 20 латинских букв и цифр, как в кабинете Kaspi"),
  title: reqText("Укажите название", 200),
  brand: optText(60),
  model: reqText("Укажите модель", 100),
  memoryGb: optInt(),
  color: optText(50),
  price: money("Укажите цену").refine((v) => v > 0, "Цена должна быть больше нуля"),
  preOrderDays: optInt().refine((v) => v == null || v <= 30, "Предзаказ — не больше 30 дней"),
  active: z.boolean().optional().default(true),
})

export async function saveKaspiOfferAction(id: string | null, input: unknown): Promise<ActionResult> {
  const ctx = await companyShop()
  if (!ctx) return NO_SHOP
  const parsed = offerSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Проверьте поля", fieldErrors: fieldErrorsOf(parsed.error) }
  const d = parsed.data
  const clash = await prisma.kaspiOffer.findFirst({ where: { ownerId: ctx.user.id, sku: d.sku, ...(id ? { NOT: { id } } : {}) }, select: { id: true } })
  if (clash) return { ok: false, error: "Такой артикул уже есть", fieldErrors: { sku: "Артикул уже используется в прайсе" } }
  if (id) {
    const { count } = await prisma.kaspiOffer.updateMany({ where: { id, ownerId: ctx.user.id }, data: d })
    if (!count) return { ok: false, error: "Товар не найден" }
  } else {
    await prisma.kaspiOffer.create({ data: { ...d, ownerId: ctx.user.id } })
  }
  refresh()
  return { ok: true, data: undefined }
}

export async function setKaspiOfferActiveAction(id: string, active: boolean): Promise<ActionResult> {
  const user = await requireUser()
  const { count } = await prisma.kaspiOffer.updateMany({ where: { id, ownerId: user.id }, data: { active: !!active } })
  if (!count) return { ok: false, error: "Товар не найден" }
  refresh()
  return { ok: true, data: undefined }
}

export async function deleteKaspiOfferAction(id: string): Promise<ActionResult> {
  const user = await requireUser()
  const { count } = await prisma.kaspiOffer.deleteMany({ where: { id, ownerId: user.id } })
  if (!count) return { ok: false, error: "Товар не найден" }
  refresh()
  return { ok: true, data: undefined }
}
