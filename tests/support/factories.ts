import type { Prisma, UserRole } from "@prisma/client"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/db"
import { luhnCheckDigit } from "@/lib/imei"
import { SESSION_COOKIE, signSession } from "@/lib/session"
import { cookieJar } from "./next-mocks"

let seq = 0

/** Уникальный IMEI с верной контрольной цифрой */
export function makeImei() {
  const first14 = "35" + String(++seq).padStart(12, "0")
  return first14 + luhnCheckDigit(first14)
}

export async function createUser(data: Partial<Prisma.UserCreateInput> & { password?: string; role?: UserRole } = {}) {
  const { password = "secret123", ...rest } = data
  return prisma.user.create({
    data: {
      login: `user${++seq}-${Math.random().toString(36).slice(2, 8)}`,
      name: "Тест",
      phone: "+7 701 000 00 00",
      companyName: "Магазин",
      passwordHash: await bcrypt.hash(password, 4),
      ...rest,
    },
  })
}

/** Войти: следующий вызов action выполнится от этого пользователя */
export async function loginAs(user: { id: string; login: string; sessionVersion: number }) {
  cookieJar.set(SESSION_COOKIE, await signSession({ sub: user.id, login: user.login, v: user.sessionVersion }))
}

export async function createPhone(ownerId: string, data: Partial<Prisma.PhoneUncheckedCreateInput> = {}) {
  return prisma.phone.create({
    data: {
      ownerId,
      model: "iPhone 15 Pro",
      memoryGb: 256,
      color: "Чёрный",
      imei1: makeImei(),
      serialNumber: "F2LXK1Q9P3",
      purchasePrice: 400_000,
      receivedAt: new Date("2026-10-01T00:00:00Z"),
      ...data,
    },
  })
}

/** Данные формы телефона — как их отправляет браузер */
export function phoneForm(overrides: Record<string, unknown> = {}) {
  return {
    model: "iPhone 15 Pro",
    memoryGb: "256",
    color: "Чёрный титан",
    imei1: makeImei(),
    imei2: "",
    serialNumber: "f2lxk1q9p3",
    condition: "NEW",
    purchasePrice: "450 000",
    receivedAt: "2026-10-01",
    supplier: "Алмас",
    note: "",
    status: "IN_STOCK",
    ...overrides,
  }
}

export function saleForm(overrides: Record<string, unknown> = {}) {
  return {
    salePrice: "500 000",
    soldAt: "2026-10-10",
    buyerName: "Ержан",
    buyerPhone: "",
    paymentMethod: "CASH",
    paidNow: "",
    prepayMethod: "CASH",
    dueDate: "",
    note: "",
    ...overrides,
  }
}
