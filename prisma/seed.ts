import { PrismaClient, type PaymentMethod, type PhoneCondition, type VerificationStatus } from "@prisma/client"
import bcrypt from "bcryptjs"
import { luhnCheckDigit } from "../src/lib/imei"
import { addDays, todayDate } from "../src/lib/dates"

const prisma = new PrismaClient()

function imei(prefix: string, n: number) {
  const first14 = prefix + String(n).padStart(14 - prefix.length, "0")
  return first14 + luhnCheckDigit(first14)
}

async function seedAdmin() {
  const login = process.env.ADMIN_LOGIN
  const password = process.env.ADMIN_PASSWORD
  if (!login || !password) throw new Error("Задайте ADMIN_LOGIN и ADMIN_PASSWORD в .env")

  const existing = await prisma.user.findUnique({ where: { login: login.toLowerCase() } })
  if (existing) {
    console.log(`Пользователь «${login}» уже есть — пароль не меняем`)
    return existing
  }
  const user = await prisma.user.create({
    data: { login: login.toLowerCase(), role: "ADMIN", passwordHash: await bcrypt.hash(password, 10) },
  })
  console.log(`Создан пользователь «${login}»`)
  return user
}

async function seedDemo(userId: string) {
  if ((await prisma.phone.count({ where: { ownerId: userId } })) > 0) {
    console.log("В базе уже есть телефоны — демо-данные не добавляем")
    return
  }
  const today = todayDate()

  type Demo = {
    model: string
    memoryGb: number
    color: string
    condition?: PhoneCondition
    purchasePrice: number
    daysAgo: number
    supplier: string
    dual?: boolean
    serial: string
    sale?: { price: number; daysAgo: number; buyer: string; phone: string; method: PaymentMethod }
    status?: "RESERVED" | "RETURNED"
  }

  const demo: Demo[] = [
    { model: "iPhone 15 Pro", memoryGb: 256, color: "Натуральный титан", purchasePrice: 480_000, daysAgo: 20, supplier: "Алмас (Дубай)", dual: true, serial: "F2LXK1Q9P3", sale: { price: 545_000, daysAgo: 0, buyer: "Ержан", phone: "+7 701 123 45 67", method: "KASPI" } },
    { model: "iPhone 15 Pro", memoryGb: 128, color: "Чёрный титан", purchasePrice: 430_000, daysAgo: 18, supplier: "Алмас (Дубай)", dual: true, serial: "F2LXK1Q9P4" },
    { model: "iPhone 15", memoryGb: 128, color: "Розовый", purchasePrice: 340_000, daysAgo: 15, supplier: "Алмас (Дубай)", dual: true, serial: "G7HTR2M1K8", sale: { price: 389_000, daysAgo: 3, buyer: "Айгерим", phone: "+7 747 555 11 22", method: "CASH" } },
    { model: "iPhone 16 Pro Max", memoryGb: 256, color: "Пустынный титан", purchasePrice: 640_000, daysAgo: 6, supplier: "Нурлан", dual: true, serial: "H9QWE3R4T5" },
    { model: "iPhone 16 Pro Max", memoryGb: 512, color: "Белый титан", purchasePrice: 720_000, daysAgo: 6, supplier: "Нурлан", dual: true, serial: "H9QWE3R4T6" },
    { model: "iPhone 14 Pro Max", memoryGb: 256, color: "Фиолетовый", condition: "USED", purchasePrice: 360_000, daysAgo: 30, supplier: "Частное лицо", dual: true, serial: "D4FGH5J6K7", sale: { price: 410_000, daysAgo: 12, buyer: "Данияр", phone: "+7 705 777 88 99", method: "INSTALLMENT" } },
    { model: "iPhone 13", memoryGb: 128, color: "Синий", condition: "USED", purchasePrice: 175_000, daysAgo: 25, supplier: "Частное лицо", serial: "C1VBN2M3Q4", status: "RESERVED" },
    { model: "Samsung Galaxy S24 Ultra", memoryGb: 256, color: "Титановый серый", purchasePrice: 455_000, daysAgo: 10, supplier: "Samsung Store", dual: true, serial: "R5CW30ABCDE" },
    { model: "Samsung Galaxy A55", memoryGb: 128, color: "Тёмно-синий", purchasePrice: 155_000, daysAgo: 9, supplier: "Samsung Store", dual: true, serial: "R5CW31FGHIJ", sale: { price: 179_000, daysAgo: 1, buyer: "Мадина", phone: "+7 778 222 33 44", method: "TRANSFER" } },
    { model: "Xiaomi 14", memoryGb: 512, color: "Чёрный", purchasePrice: 290_000, daysAgo: 8, supplier: "Mi Store", dual: true, serial: "XM14A00123" },
    { model: "iPhone 15 Pro Max", memoryGb: 256, color: "Синий титан", purchasePrice: 560_000, daysAgo: 4, supplier: "Алмас (Дубай)", dual: true, serial: "F2LXK1Q9P7" },
    { model: "iPhone 12", memoryGb: 64, color: "Белый", condition: "USED", purchasePrice: 120_000, daysAgo: 40, supplier: "Частное лицо", serial: "B8NMJ7H6G5", status: "RETURNED" },
  ]

  const phones = []
  for (const [i, d] of demo.entries()) {
    const receivedAt = addDays(today, -d.daysAgo)
    const phone = await prisma.phone.create({
      data: {
        ownerId: userId,
        model: d.model,
        memoryGb: d.memoryGb,
        color: d.color,
        condition: d.condition ?? "NEW",
        imei1: imei("3567890", 1000 + i * 2),
        imei2: d.dual ? imei("3567890", 1001 + i * 2) : null,
        serialNumber: d.serial,
        purchasePrice: d.purchasePrice,
        receivedAt,
        supplier: d.supplier,
        status: d.sale ? "SOLD" : (d.status ?? "IN_STOCK"),
        events: {
          create: {
            type: "CREATED",
            message: `Поступил на склад от «${d.supplier}», закупка ${d.purchasePrice.toLocaleString("ru-RU")} ₸`,
            userId,
            createdAt: receivedAt,
          },
        },
      },
    })
    if (d.sale) {
      const soldAt = addDays(today, -d.sale.daysAgo)
      await prisma.sale.create({
        data: {
          phoneId: phone.id,
          salePrice: d.sale.price,
          soldAt,
          buyerName: d.sale.buyer,
          buyerPhone: d.sale.phone,
          paymentMethod: d.sale.method,
        },
      })
      await prisma.phoneEvent.create({
        data: {
          phoneId: phone.id,
          type: "SOLD",
          message: `Продан за ${d.sale.price.toLocaleString("ru-RU")} ₸, покупатель: ${d.sale.buyer}`,
          userId,
          createdAt: soldAt,
        },
      })
    }
    phones.push(phone)
  }

  const [asel, timur, dana] = await Promise.all([
    prisma.verifier.create({ data: { ownerId: userId, fullName: "Сейткали Асель Маратовна", phone: "+7 702 111 22 33" } }),
    prisma.verifier.create({
      data: { ownerId: userId, fullName: "Ахметов Тимур Ерланович", phone: "+7 707 444 55 66", note: "Часто летает в Турцию" },
    }),
    prisma.verifier.create({ data: { ownerId: userId, fullName: "Нурланова Дана", phone: "+7 776 999 00 11" } }),
  ])

  const verifications: {
    phone: (typeof phones)[number]
    verifierId: string
    verifierName: string
    country: string
    daysAgo: number
    status: VerificationStatus
    payment: number
    isPaid: boolean
    completedDaysAgo?: number
  }[] = [
    { phone: phones[3], verifierId: asel.id, verifierName: asel.fullName, country: "ОАЭ", daysAgo: 2, status: "HANDED", payment: 25_000, isPaid: false },
    { phone: phones[4], verifierId: timur.id, verifierName: timur.fullName, country: "Турция", daysAgo: 4, status: "IN_PROGRESS", payment: 25_000, isPaid: false },
    { phone: phones[1], verifierId: timur.id, verifierName: timur.fullName, country: "Турция", daysAgo: 14, status: "VERIFIED", payment: 25_000, isPaid: true, completedDaysAgo: 11 },
    { phone: phones[7], verifierId: dana.id, verifierName: dana.fullName, country: "Китай", daysAgo: 7, status: "VERIFIED", payment: 25_000, isPaid: false, completedDaysAgo: 5 },
    { phone: phones[9], verifierId: asel.id, verifierName: asel.fullName, country: "ОАЭ", daysAgo: 6, status: "REJECTED", payment: 0, isPaid: false, completedDaysAgo: 5 },
  ]

  for (const v of verifications) {
    const handedAt = addDays(today, -v.daysAgo)
    await prisma.verification.create({
      data: {
        ownerId: userId,
        phoneId: v.phone.id,
        phoneModel: v.phone.model,
        imei1: v.phone.imei1,
        imei2: v.phone.imei2,
        serialNumber: v.phone.serialNumber,
        verifierId: v.verifierId,
        country: v.country,
        handedAt,
        imeiGiven: v.phone.imei2 ? "BOTH" : "IMEI1",
        payment: v.payment,
        isPaid: v.isPaid,
        paidAt: v.isPaid ? handedAt : null,
        status: v.status,
        completedAt: v.completedDaysAgo != null ? addDays(today, -v.completedDaysAgo) : null,
      },
    })
    await prisma.phoneEvent.create({
      data: {
        phoneId: v.phone.id,
        type: "VERIFICATION_CREATED",
        message: `Отдан на верификацию: ${v.verifierName} (${v.country})`,
        userId,
        createdAt: handedAt,
      },
    })
    const active = v.status === "HANDED" || v.status === "IN_PROGRESS"
    await prisma.phone.update({
      where: { id: v.phone.id },
      data: {
        status: active ? "ON_VERIFICATION" : undefined,
        isVerified: v.status === "VERIFIED" ? true : undefined,
      },
    })
  }

  // Верификация «вручную» — телефон не из наших товаров
  await prisma.verification.create({
    data: {
      ownerId: userId,
      phoneModel: "iPhone 14",
      imei1: imei("3567890", 9000),
      imei2: imei("3567890", 9001),
      serialNumber: "MANUAL14X1",
      verifierId: dana.id,
      country: "Китай",
      handedAt: addDays(today, -1),
      imeiGiven: "BOTH",
      payment: 25_000,
      status: "IN_PROGRESS",
      note: "Телефон знакомого, не из наших товаров",
    },
  })

  console.log(`Добавлено демо: ${phones.length} телефонов, 3 верификатора, ${verifications.length + 1} верификаций`)
}

async function main() {
  const admin = await seedAdmin()
  if (process.env.SEED_DEMO !== "false") await seedDemo(admin.id)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
