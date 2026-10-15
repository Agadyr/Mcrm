import { z } from "zod"
import { normalizeImei } from "@/lib/imei"
import { optMoney, optText, reqDate } from "./common"

export const verificationStatusEnum = z.enum(["HANDED", "IN_PROGRESS", "VERIFIED", "NOT_REGISTERED", "REJECTED"])

export const verificationSchema = z
  .object({
    // Телефон: проданный из товаров или клиентский вручную
    phoneMode: z.enum(["stock", "manual"]),
    phoneId: z.string().optional().nullable(),
    phoneModel: z.string().trim().max(100).optional().nullable(),
    imei1: z.string().optional().nullable().transform((v) => normalizeImei(v)),
    imei2: z.string().optional().nullable().transform((v) => normalizeImei(v) || null),
    serialNumber: optText(50).transform((v) => (v ? v.toUpperCase() : v)), // серийник всегда заглавными

    // Кому отдали: человек из справочника, новый человек или верификатор-аккаунт
    verifierMode: z.enum(["existing", "new", "agent"]),
    verifierId: z.string().optional().nullable(),
    verifierName: z.string().trim().max(150).optional().nullable(),
    verifierPhone: optText(50),
    agentId: z.string().optional().nullable(),
    // сколько платят верификатору: компания → верификатору, или клиент → верификатору (его собственные телефоны)
    agentFee: optMoney(),
    agentPaid: z.boolean().optional().default(false),

    country: optText(100),
    handedAt: reqDate("Укажите дату передачи"),
    payment: optMoney(),
    isPaid: z.boolean().optional().default(false),
    status: verificationStatusEnum,
    note: optText(2000),
  })
  .superRefine((d, ctx) => {
    if (d.phoneMode === "stock" && !d.phoneId) {
      ctx.addIssue({ code: "custom", path: ["phoneId"], message: "Выберите телефон" })
    }
    if (d.phoneMode === "manual") {
      if (!d.phoneModel) ctx.addIssue({ code: "custom", path: ["phoneModel"], message: "Укажите модель" })
      if (!d.imei1) ctx.addIssue({ code: "custom", path: ["imei1"], message: "Укажите IMEI1" })
      else if (!/^\d{1,20}$/.test(d.imei1))
        ctx.addIssue({ code: "custom", path: ["imei1"], message: "IMEI должен состоять только из цифр" })
      if (!d.imei2) ctx.addIssue({ code: "custom", path: ["imei2"], message: "Укажите IMEI2" })
      else if (!/^\d{1,20}$/.test(d.imei2))
        ctx.addIssue({ code: "custom", path: ["imei2"], message: "IMEI должен состоять только из цифр" })
      if (d.imei2 && d.imei1 === d.imei2)
        ctx.addIssue({ code: "custom", path: ["imei2"], message: "IMEI2 совпадает с IMEI1" })
      if (!d.serialNumber)
        ctx.addIssue({ code: "custom", path: ["serialNumber"], message: "Укажите серийный номер" })
    }
    if (d.verifierMode === "existing" && !d.verifierId) {
      ctx.addIssue({ code: "custom", path: ["verifierId"], message: "Выберите человека" })
    }
    if (d.verifierMode === "new" && !d.verifierName) {
      ctx.addIssue({ code: "custom", path: ["verifierName"], message: "Укажите ФИО" })
    }
    if (d.verifierMode === "agent" && !d.agentId) {
      ctx.addIssue({ code: "custom", path: ["agentId"], message: "Выберите верификатора" })
    }
  })

/** Сколько по умолчанию платим человеку за верификацию одного телефона */
export const DEFAULT_VERIFICATION_PAYMENT = 25_000

/** Чего не хватает телефону для верификации (нужны IMEI1, IMEI2 и серийный номер) */
export function missingForVerification(p: { imei1: string | null; imei2: string | null; serialNumber: string | null }) {
  const missing: string[] = []
  if (!p.imei1) missing.push("IMEI1")
  if (!p.imei2) missing.push("IMEI2")
  if (!p.serialNumber) missing.push("серийный номер")
  return missing
}

export type VerificationInput = z.input<typeof verificationSchema>
export type VerificationData = z.output<typeof verificationSchema>

/** Один телефон в пакетной передаче верификатору: проданный из товаров (phoneId) или клиентский, введён вручную */
const batchItemSchema = z.object({
  phoneId: z.string().optional().nullable(),
  phoneModel: z.string().trim().max(100).optional().nullable(),
  imei1: z.string().optional().nullable().transform((v) => normalizeImei(v)),
  imei2: z.string().optional().nullable().transform((v) => normalizeImei(v) || null),
  serialNumber: optText(50).transform((v) => (v ? v.toUpperCase() : v)),
  agentFee: optMoney(),
})

/** Передать сразу несколько телефонов одному верификатору */
export const batchHandoverSchema = z
  .object({
    agentId: z.string().min(1, "Выберите верификатора"),
    handedAt: reqDate("Укажите дату передачи"),
    agentPaid: z.boolean().optional().default(false),
    note: optText(2000),
    items: z.array(batchItemSchema).min(1, "Добавьте хотя бы один телефон").max(100, "Не более 100 телефонов за раз"),
  })
  .superRefine((d, ctx) => {
    const seen = new Map<string, number>()
    d.items.forEach((it, i) => {
      const at = (field: string, message: string) => ctx.addIssue({ code: "custom", path: ["items", i, field], message })
      if (it.phoneId) {
        if (seen.has(it.phoneId)) at("phoneId", "Этот телефон уже есть в списке")
        seen.set(it.phoneId, i)
        return
      }
      if (!it.phoneModel) at("phoneModel", "Укажите модель")
      if (!it.imei1) at("imei1", "Укажите IMEI1")
      else if (!/^\d{1,20}$/.test(it.imei1)) at("imei1", "Только цифры")
      if (!it.imei2) at("imei2", "Укажите IMEI2")
      else if (!/^\d{1,20}$/.test(it.imei2)) at("imei2", "Только цифры")
      else if (it.imei1 === it.imei2) at("imei2", "Совпадает с IMEI1")
      if (!it.serialNumber) at("serialNumber", "Укажите серийный номер")
      for (const [field, imei] of [["imei1", it.imei1], ["imei2", it.imei2]] as const) {
        if (!imei) continue
        const prev = seen.get(imei)
        if (prev !== undefined && prev !== i) at(field, `Такой IMEI уже есть в строке ${prev + 1}`)
        seen.set(imei, i)
      }
    })
  })

export type BatchHandoverInput = z.input<typeof batchHandoverSchema>

/** Работа верификатора по телефону, который ему передала компания: кого нашёл, статус, сколько платит человеку */
export const agentWorkSchema = z
  .object({
    verifierMode: z.enum(["none", "existing", "new"]),
    verifierId: z.string().optional().nullable(),
    verifierName: z.string().trim().max(150).optional().nullable(),
    verifierPhone: optText(50),
    country: optText(100),
    status: verificationStatusEnum,
    payment: optMoney(),
    isPaid: z.boolean().optional().default(false),
    agentNote: optText(2000),
  })
  .superRefine((d, ctx) => {
    if (d.verifierMode === "existing" && !d.verifierId)
      ctx.addIssue({ code: "custom", path: ["verifierId"], message: "Выберите человека" })
    if (d.verifierMode === "new" && !d.verifierName)
      ctx.addIssue({ code: "custom", path: ["verifierName"], message: "Укажите ФИО" })
    if (d.verifierMode === "none" && d.status !== "HANDED")
      ctx.addIssue({ code: "custom", path: ["verifierId"], message: "Сначала выберите человека, которому отдали IMEI" })
  })

export type AgentWorkInput = z.input<typeof agentWorkSchema>
export type AgentWorkData = z.output<typeof agentWorkSchema>

export const verifierSchema = z.object({
  fullName: z.string().trim().min(1, "Укажите ФИО").max(150),
  phone: optText(50),
  note: optText(1000),
})

export type VerifierInput = z.input<typeof verifierSchema>
