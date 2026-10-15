import { after } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { prisma } from "@/lib/db"
import { sellPhoneAction } from "@/server/actions/phones"
import {
  createBatchHandoverAction,
  createVerificationAction,
  deleteVerificationAction,
  setAgentPaidAction,
  setVerificationStatusAction,
  updateAgentWorkAction,
} from "@/server/actions/verifications"
import { createPhone, createUser, loginAs, makeImei, saleForm } from "../support/factories"

const handover = (phoneId: string, agentId: string, extra: Record<string, unknown> = {}) => ({
  phoneMode: "stock",
  phoneId,
  verifierMode: "agent",
  agentId,
  agentFee: "25 000",
  handedAt: "2026-10-11",
  status: "HANDED",
  ...extra,
})

const work = (extra: Record<string, unknown> = {}) => ({
  verifierMode: "new",
  verifierName: "Дана",
  country: "ОАЭ",
  status: "IN_PROGRESS",
  payment: "10000",
  isPaid: false,
  agentNote: "секрет",
  ...extra,
})

/** Компания с проданным телефоном (IMEI1, IMEI2, серийник) и одобренный верификатор */
async function setup() {
  const company = await createUser()
  const agent = await createUser({ role: "VERIFIER", name: "Мади" })
  const phone = await createPhone(company.id, { imei2: makeImei() })
  await loginAs(company)
  await sellPhoneAction(phone.id, saleForm())
  return { company, agent, phone }
}

beforeEach(() => vi.mocked(after).mockClear())

describe("передача телефона верификатору", () => {
  it("компания → верификатор → «Верифицирован»: телефон помечен, компании уходит уведомление", async () => {
    const { company, agent, phone } = await setup()
    const created = await createVerificationAction(handover(phone.id, agent.id))
    expect(created.ok).toBe(true)
    if (!created.ok) return
    const id = created.data.id
    expect(after).toHaveBeenCalledTimes(1) // уведомление верификатору

    await loginAs(agent)
    // без человека статус не поменять
    expect(await setVerificationStatusAction(id, "VERIFIED")).toMatchObject({ ok: false })
    expect((await updateAgentWorkAction(id, work())).ok).toBe(true)
    expect((await setVerificationStatusAction(id, "VERIFIED")).ok).toBe(true)
    expect(after).toHaveBeenCalledTimes(2) // уведомление компании о результате

    const v = await prisma.verification.findUniqueOrThrow({ where: { id }, include: { verifier: true } })
    expect(v).toMatchObject({ status: "VERIFIED", agentFee: 25_000, agentNote: "секрет" })
    expect(v.completedAt).not.toBeNull()
    expect(v.verifier?.ownerId).toBe(agent.id) // человек — в справочнике верификатора, не компании

    const p = await prisma.phone.findUniqueOrThrow({ where: { id: phone.id }, include: { events: true } })
    expect(p).toMatchObject({ status: "SOLD", isVerified: true })
    // в истории телефона компании нет имени человека
    expect(p.events.map((e) => e.message).join("\n")).not.toContain("Дана")

    // оплату верификатору отмечает компания, а не он сам
    expect(await setAgentPaidAction(id, true)).toEqual({ ok: false, error: "Оплату отмечает компания" })
    await loginAs(company)
    expect((await setAgentPaidAction(id, true)).ok).toBe(true)
    // компания может поставить статус и за верификатора — ему уходит уведомление
    vi.mocked(after).mockClear()
    expect((await setVerificationStatusAction(id, "REJECTED")).ok).toBe(true)
    expect(after).toHaveBeenCalledTimes(1)
    const events = await prisma.phoneEvent.findMany({ where: { phoneId: phone.id } })
    expect(events.map((e) => e.message).join("\n")).toContain("Компания изменила статус")
  })

  it("компания ставит статус, пока верификатор ещё ищет человека; чужая компания — нет", async () => {
    const { agent, phone } = await setup()
    const created = await createVerificationAction(handover(phone.id, agent.id))
    if (!created.ok) throw new Error(created.error)
    expect((await setVerificationStatusAction(created.data.id, "VERIFIED")).ok).toBe(true)
    expect((await prisma.phone.findUniqueOrThrow({ where: { id: phone.id } })).isVerified).toBe(true)

    await loginAs(await createUser())
    expect(await setVerificationStatusAction(created.data.id, "REJECTED")).toMatchObject({ ok: false })
  })

  it("непроданный телефон отдать нельзя", async () => {
    const company = await createUser()
    const agent = await createUser({ role: "VERIFIER" })
    const phone = await createPhone(company.id, { imei2: makeImei() })
    await loginAs(company)
    expect(await createVerificationAction(handover(phone.id, agent.id))).toMatchObject({
      ok: false,
      fieldErrors: { phoneId: "Телефон ещё не продан" },
    })
  })

  it("повторно — только после «Отказ» или «Не зарегистрирован»", async () => {
    const { agent, phone } = await setup()
    const first = await createVerificationAction(handover(phone.id, agent.id))
    expect(await createVerificationAction(handover(phone.id, agent.id))).toMatchObject({
      ok: false,
      fieldErrors: { phoneId: "Телефон уже на верификации" },
    })
    if (!first.ok) return
    await prisma.verification.update({ where: { id: first.data.id }, data: { status: "REJECTED" } })
    expect((await createVerificationAction(handover(phone.id, agent.id))).ok).toBe(true)
  })

  it("без IMEI2 и серийника — дополнить карточку", async () => {
    const company = await createUser()
    const agent = await createUser({ role: "VERIFIER" })
    const phone = await createPhone(company.id, { serialNumber: null, status: "SOLD" })
    await loginAs(company)
    const r = await createVerificationAction(handover(phone.id, agent.id))
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining("IMEI2, серийный номер") })
  })

  it("заблокированному верификатору передать нельзя", async () => {
    const { phone } = await setup()
    const blocked = await createUser({ role: "VERIFIER", isActive: false })
    expect(await createVerificationAction(handover(phone.id, blocked.id))).toMatchObject({ ok: false, fieldErrors: { agentId: expect.any(String) } })
  })

  it("удалить передачу может только компания", async () => {
    const { agent, phone } = await setup()
    const r = await createVerificationAction(handover(phone.id, agent.id))
    if (!r.ok) throw new Error(r.error)
    await loginAs(agent)
    expect((await deleteVerificationAction(r.data.id)).ok).toBe(false)
  })
})

describe("пакетная передача", () => {
  it("несколько телефонов — запись на каждый и одно уведомление", async () => {
    const { company, agent, phone } = await setup()
    const second = await createPhone(company.id, { imei2: makeImei(), status: "SOLD" })
    const r = await createBatchHandoverAction({
      agentId: agent.id,
      handedAt: "2026-10-11",
      items: [
        { phoneId: phone.id, agentFee: "25000" },
        { phoneId: second.id, agentFee: "30000" },
        { phoneModel: "Galaxy S24", imei1: makeImei(), imei2: makeImei(), serialNumber: "R5CW30ABCDE", agentFee: "20000" },
      ],
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.ids).toHaveLength(3)
    expect(after).toHaveBeenCalledTimes(1)
    expect(await prisma.verification.aggregate({ _sum: { agentFee: true } })).toMatchObject({ _sum: { agentFee: 75_000 } })
  })

  it("ошибка одного телефона откатывает всю пачку и показывается у его строки", async () => {
    const { company, agent, phone } = await setup()
    const notSold = await createPhone(company.id, { imei2: makeImei() })
    const r = await createBatchHandoverAction({
      agentId: agent.id,
      handedAt: "2026-10-11",
      items: [{ phoneId: phone.id }, { phoneId: notSold.id }],
    })
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining("Телефон №2"), fieldErrors: { "items.1.phoneId": expect.any(String) } })
    expect(await prisma.verification.count()).toBe(0)
  })
})
