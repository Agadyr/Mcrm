import "server-only"
import { prisma } from "@/lib/db"
import { dateToYmd, todayYmd } from "@/lib/dates"
import { formatMoney } from "@/lib/format"
import { missingForVerification } from "@/lib/validators/verification"
import { getAgentOptions, getVerifierOptions } from "@/app/(app)/verifications/form-data"
import { updatePhoneAction } from "@/server/actions/phones"
import { createVerificationAction } from "@/server/actions/verifications"
import { extractImeis, parseMoney } from "./parse"
import { phoneButton, phoneName, recentPhones, searchPhones } from "./phones"
import { CANCEL, SKIP, crmButton, esc, grid, send, setState, stepTitle, type Keyboard } from "./ui"
import type { Ctx, Input, VerifyState } from "./types"

// «🛡 Верификация»: проданный телефон → (дополнить IMEI2 и S/N, если нет) → кому: верификатору или своему человеку →
// сумма → проверить и передать. Дальше всё как на сайте: уведомление верификатору, история телефона.

const FEES = [20_000, 25_000, 30_000]
const COUNTRIES = ["ОАЭ", "Турция", "Китай"]

const loadPhone = (ctx: Ctx, id: string) => prisma.phone.findFirst({ where: { id, ownerId: ctx.user.id } })

export async function startVerify(ctx: Ctx, phoneId?: string) {
  const s: VerifyState = { flow: "verify", step: "pick", d: {} }
  if (phoneId) return choosePhone(ctx, s, phoneId)
  await ask(ctx, s)
}

async function choosePhone(ctx: Ctx, s: VerifyState, id: string) {
  const p = await loadPhone(ctx, id)
  if (!p) return send(ctx.chatId, "Телефон не найден.")
  if (p.status !== "SOLD") return send(ctx.chatId, `${esc(p.model)} ещё не продан — на верификацию только после продажи.`, [[{ text: "💰 Продать", data: `sp:${p.id}` }]])
  s.d.phoneId = p.id
  s.step = nextAfterPhone(p)
  await ask(ctx, s)
}

/** Для верификации нужны оба IMEI и серийный номер — если их нет в карточке, спросим */
function nextAfterPhone(p: { imei1: string; imei2: string | null; serialNumber: string | null }): VerifyState["step"] {
  if (!p.imei2) return "imei2"
  if (!p.serialNumber) return "serial"
  return "to"
}

const total = (s: VerifyState) => (s.d.verifierMode === "agent" ? 3 : s.d.verifierMode ? 5 : 3)

async function ask(ctx: Ctx, s: VerifyState) {
  const id = ctx.user.id
  let html = ""
  let kb: Keyboard = []
  const p = s.d.phoneId ? await loadPhone(ctx, s.d.phoneId) : null
  const head = p ? `📱 ${esc(phoneName(p))} · …${p.imei1.slice(-4)}\n\n` : ""
  switch (s.step) {
    case "pick": {
      const recent = await recentPhones(id, "verify")
      html = `${stepTitle(1, total(s), "Какой телефон отдаёте?")}\nПришлите IMEI, последние 4 цифры или модель проданного телефона.`
      if (recent.length) html += "\n\nИли выберите из последних проданных:"
      else html = "Нет проданных телефонов, которые можно отдать на верификацию."
      kb = recent.map((r) => [phoneButton(r, "pk")])
      break
    }
    case "imei2":
      html = `${head}<b>Не хватает IMEI2</b>\nБез него верификацию не оформить. Пришлите IMEI2 — он сохранится в карточке телефона.`
      break
    case "serial":
      html = `${head}<b>Не хватает серийного номера</b>\nПришлите S/N — он сохранится в карточке телефона.`
      break
    case "to": {
      const agents = (await getAgentOptions(id)).slice(0, 8)
      html = `${head}${stepTitle(2, 3, "Кому отдаёте?")}\nВерификатору — он сам найдёт человека. Или своему человеку напрямую.`
      kb = [
        ...agents.map((a) => [{ text: `👤 ${a.name}${a.activeCount ? ` · в работе ${a.activeCount}` : ""}`, data: `ag:${a.id}` }]),
        [{ text: "🙋 Своему человеку", data: "own" }],
      ]
      break
    }
    case "agentFee":
      html = `${head}${stepTitle(3, 3, `Сколько платите верификатору ${esc(s.d.agentName)}?`)}\nВыберите или напишите сумму.`
      kb = grid(FEES.map((f) => ({ text: formatMoney(f), data: `v:${f}` })), 3)
      break
    case "person": {
      const people = (await getVerifierOptions(id)).slice(0, 8)
      html = `${head}${stepTitle(3, 5, "Кому именно?")}${people.length ? "\nВыберите человека или добавьте нового." : ""}`
      kb = [...people.map((v) => [{ text: `${v.fullName}${v.verifiedCount ? ` · ✅ ${v.verifiedCount}` : ""}`, data: `pr:${v.id}` }]), [{ text: "➕ Новый человек", data: "pr:new" }]]
      break
    }
    case "newName":
      html = `${head}${stepTitle(3, 5, "Новый человек")}\nНапишите ФИО.`
      break
    case "newPhone":
      html = `${head}${stepTitle(3, 5, "Телефон человека")}`
      kb = [[SKIP]]
      break
    case "country":
      html = `${head}${stepTitle(4, 5, "Страна")}\nГде был человек? Выберите или напишите.`
      kb = [[...COUNTRIES.map((c) => ({ text: c, data: `v:${c}` }))], [SKIP]]
      break
    case "payment":
      html = `${head}${stepTitle(5, 5, "Сколько платите человеку?")}`
      kb = [...grid(FEES.map((f) => ({ text: formatMoney(f), data: `v:${f}` })), 3), [{ text: "Без оплаты", data: "skip" }]]
      break
    case "confirm": {
      const d = s.d
      html = [
        "<b>Проверьте и передайте</b>",
        "",
        `📱 ${esc(p ? phoneName(p) : "")}`,
        p ? `IMEI1: <code>${p.imei1}</code>` : null,
        p?.imei2 ? `IMEI2: <code>${p.imei2}</code>` : null,
        p?.serialNumber ? `S/N: <code>${esc(p.serialNumber)}</code>` : null,
        "",
        d.verifierMode === "agent"
          ? `Верификатору: <b>${esc(d.agentName)}</b> · ${formatMoney(d.agentFee)}`
          : `Человеку: <b>${esc(d.verifierName)}</b>${d.country ? ` (${esc(d.country)})` : ""} · ${formatMoney(d.payment)}`,
      ]
        .filter((l) => l !== null)
        .join("\n")
      await setState(id, s)
      return send(ctx.chatId, html, [[{ text: "✅ Передать", data: "ok" }], [CANCEL]])
    }
  }
  await setState(id, s)
  await send(ctx.chatId, html, [...kb, [CANCEL]])
}

/** Дописать в карточку телефона недостающий IMEI2 или S/N — через обычное сохранение товара (с проверкой дублей и историей) */
async function fillPhone(ctx: Ctx, phoneId: string, patch: { imei2?: string; serialNumber?: string }) {
  const p = await loadPhone(ctx, phoneId)
  if (!p) return { ok: false as const, error: "Телефон не найден" }
  const res = await updatePhoneAction(p.id, {
    model: p.model,
    memoryGb: p.memoryGb,
    color: p.color,
    imei1: p.imei1,
    imei2: patch.imei2 ?? p.imei2,
    serialNumber: patch.serialNumber ?? p.serialNumber,
    condition: p.condition,
    purchasePrice: p.purchasePrice,
    receivedAt: dateToYmd(p.receivedAt),
    supplier: p.supplier,
    note: p.note,
    status: p.status,
  })
  return res.ok ? { ok: true as const, phone: (await loadPhone(ctx, phoneId))! } : { ok: false as const, error: Object.values(res.fieldErrors ?? {})[0] ?? res.error }
}

export async function handleVerify(ctx: Ctx, s: VerifyState, input: Input) {
  const text = input.kind === "text" ? input.text.trim() : ""
  const btn = input.kind === "button" ? input.data : ""
  const skip = btn === "skip"
  const pick = btn.startsWith("v:") ? btn.slice(2) : null
  const d = s.d

  switch (s.step) {
    case "pick": {
      if (btn.startsWith("pk:")) return choosePhone(ctx, s, btn.slice(3))
      if (!text) return
      const found = await searchPhones(ctx.user.id, text, "verify")
      if (found.length === 0) {
        return send(ctx.chatId, "Не нашёл проданный телефон, который можно отдать. Он не продан, уже на верификации или уже верифицирован.", [[CANCEL]])
      }
      if (found.length === 1) return choosePhone(ctx, s, found[0].id)
      return send(ctx.chatId, `Нашёл ${found.length}. Какой?`, [...found.map((f) => [phoneButton(f, "pk")]), [CANCEL]])
    }
    case "imei2": {
      const [imei2] = extractImeis(text)
      if (!imei2) return send(ctx.chatId, "Не вижу IMEI. Пришлите 15 цифр.")
      const r = await fillPhone(ctx, d.phoneId!, { imei2 })
      if (!r.ok) return send(ctx.chatId, `❌ ${esc(r.error)}`)
      s.step = nextAfterPhone(r.phone)
      break
    }
    case "serial": {
      if (!text || text.length > 50) return send(ctx.chatId, "Пришлите серийный номер.")
      const r = await fillPhone(ctx, d.phoneId!, { serialNumber: text.replace(/\s+/g, "").toUpperCase() })
      if (!r.ok) return send(ctx.chatId, `❌ ${esc(r.error)}`)
      if (missingForVerification(r.phone).length) s.step = nextAfterPhone(r.phone)
      else s.step = "to"
      break
    }
    case "to":
      if (btn.startsWith("ag:")) {
        const agent = (await getAgentOptions(ctx.user.id)).find((a) => a.id === btn.slice(3))
        if (!agent) return send(ctx.chatId, "Верификатор не найден. Выберите другого.")
        Object.assign(d, { verifierMode: "agent", agentId: agent.id, agentName: agent.name })
        s.step = "agentFee"
      } else if (btn === "own") {
        s.step = "person"
      } else return send(ctx.chatId, "Выберите кнопкой, кому отдаёте.")
      break
    case "agentFee": {
      const n = pick ? Number(pick) : parseMoney(text)
      if (n == null) return send(ctx.chatId, "Выберите сумму или напишите цифрами.")
      d.agentFee = n
      s.step = "confirm"
      break
    }
    case "person":
      if (btn === "pr:new") {
        s.step = "newName"
      } else if (btn.startsWith("pr:")) {
        const person = await prisma.verifier.findFirst({ where: { id: btn.slice(3), ownerId: ctx.user.id }, select: { id: true, fullName: true } })
        if (!person) return send(ctx.chatId, "Человек не найден.")
        Object.assign(d, { verifierMode: "existing", verifierId: person.id, verifierName: person.fullName })
        s.step = "country"
      } else return send(ctx.chatId, "Выберите человека кнопкой или нажмите «➕ Новый человек».")
      break
    case "newName":
      if (!text || text.length > 150) return send(ctx.chatId, "Напишите ФИО.")
      Object.assign(d, { verifierMode: "new", verifierName: text })
      s.step = "newPhone"
      break
    case "newPhone":
      if (!skip && (!text || text.length > 50)) return send(ctx.chatId, "Напишите телефон или нажмите «Пропустить».")
      d.verifierPhone = skip ? null : text
      s.step = "country"
      break
    case "country": {
      const c = pick ?? (skip ? null : text)
      if (c === null) d.country = null
      else if (c && c.length <= 100) d.country = c
      else return send(ctx.chatId, "Напишите страну или нажмите «Пропустить».")
      s.step = "payment"
      break
    }
    case "payment": {
      const n = skip ? 0 : pick ? Number(pick) : parseMoney(text)
      if (n == null) return send(ctx.chatId, "Выберите сумму или напишите цифрами.")
      d.payment = n
      s.step = "confirm"
      break
    }
    case "confirm":
      if (btn !== "ok") return send(ctx.chatId, "Нажмите «✅ Передать» или «Отмена».")
      return save(ctx, s)
  }
  await ask(ctx, s)
}

async function save(ctx: Ctx, s: VerifyState) {
  const d = s.d
  const res = await createVerificationAction({
    phoneMode: "stock",
    phoneId: d.phoneId,
    verifierMode: d.verifierMode,
    verifierId: d.verifierId ?? null,
    verifierName: d.verifierName ?? null,
    verifierPhone: d.verifierPhone ?? null,
    agentId: d.agentId ?? null,
    agentFee: d.agentFee ?? 0,
    agentPaid: false,
    country: d.country ?? null,
    handedAt: todayYmd(),
    payment: d.payment ?? 0,
    isPaid: false,
    status: "HANDED",
    note: null,
  })
  await setState(ctx.user.id, null)
  if (!res.ok) {
    const details = Object.values(res.fieldErrors ?? {}).join("\n")
    return send(ctx.chatId, `❌ <b>Не передано:</b> ${esc(res.error)}${details ? `\n${esc(details)}` : ""}`)
  }
  const text =
    d.verifierMode === "agent"
      ? `✅ <b>Передан верификатору ${esc(d.agentName)}</b>\nОн получит уведомление. Результат придёт сюда.`
      : `✅ <b>Передан на верификацию: ${esc(d.verifierName)}</b>\nСтатус потом меняйте в CRM.`
  await send(ctx.chatId, text, [crmButton(`/verifications/${res.data.id}`)])
}
