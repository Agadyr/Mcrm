import "server-only"
import { prisma } from "@/lib/db"
import { addDays, dateToYmd, todayDate, todayYmd, ymdToDate } from "@/lib/dates"
import { formatDate, formatMoney } from "@/lib/format"
import { PAYMENT_METHOD_LABEL } from "@/lib/labels"
import { sellPhoneAction } from "@/server/actions/phones"
import { parseMoney } from "./parse"
import { phoneButton, phoneName, recentPhones, searchPhones } from "./phones"
import { CANCEL, SKIP, crmButton, esc, grid, send, setState, stepTitle, type Keyboard } from "./ui"
import type { Ctx, Input, SellState } from "./types"

// «💰 Продать»: телефон → цена → способ оплаты → покупатель (для долга: телефон, предоплата, срок) → проверить и продать

const METHODS = ["CASH", "KASPI", "TRANSFER", "INSTALLMENT", "DEBT"] as const

const loadPhone = (ctx: Ctx, id: string) =>
  prisma.phone.findFirst({ where: { id, ownerId: ctx.user.id }, select: { id: true, model: true, memoryGb: true, color: true, imei1: true, purchasePrice: true, status: true } })

export async function startSell(ctx: Ctx, phoneId?: string) {
  const s: SellState = { flow: "sell", step: "pick", d: {} }
  if (phoneId) return choosePhone(ctx, s, phoneId)
  await ask(ctx, s)
}

async function choosePhone(ctx: Ctx, s: SellState, id: string) {
  const p = await loadPhone(ctx, id)
  if (!p) return send(ctx.chatId, "Телефон не найден.")
  if (p.status === "SOLD") return send(ctx.chatId, `${esc(p.model)} уже продан.`)
  if (p.status !== "IN_STOCK" && p.status !== "RESERVED") return send(ctx.chatId, `${esc(p.model)} сейчас нельзя продать: он не в наличии.`)
  s.d.phoneId = p.id
  s.step = "price"
  await ask(ctx, s)
}

const total = (s: SellState) => (s.d.paymentMethod === "DEBT" ? 7 : 4)

async function ask(ctx: Ctx, s: SellState) {
  let html = ""
  let kb: Keyboard = []
  const p = s.d.phoneId ? await loadPhone(ctx, s.d.phoneId) : null
  const head = p ? `📱 ${esc(phoneName(p))} · …${p.imei1.slice(-4)}\n\n` : ""
  switch (s.step) {
    case "pick": {
      const recent = await recentPhones(ctx.user.id, "sell")
      html = `${stepTitle(1, total(s), "Какой телефон продаёте?")}\nПришлите IMEI, последние 4 цифры или модель.`
      if (recent.length) html += "\n\nИли выберите из последних поступивших:"
      else html = "На складе нет телефонов в наличии. Сначала добавьте телефон: «➕ Новый телефон»."
      kb = recent.map((r) => [phoneButton(r, "pk")])
      break
    }
    case "price":
      html = `${head}${stepTitle(2, total(s), "Цена продажи")}\nЗакупка была ${formatMoney(p?.purchasePrice)}. Напишите цену, например <code>520000</code> или <code>520к</code>`
      break
    case "method":
      html = `${head}${stepTitle(3, total(s), "Как оплатили?")}`
      kb = grid(METHODS.map((m) => ({ text: PAYMENT_METHOD_LABEL[m], data: `v:${m}` })), 2)
      break
    case "buyer":
      html =
        s.d.paymentMethod === "DEBT"
          ? `${head}${stepTitle(4, 7, "Кто должен?")}\nНапишите имя покупателя — без него долг не найти.`
          : `${head}${stepTitle(4, 4, "Покупатель")}\nНапишите имя покупателя или пропустите.`
      if (s.d.paymentMethod !== "DEBT") kb = [[SKIP]]
      break
    case "buyerPhone":
      html = `${head}${stepTitle(5, 7, "Телефон покупателя")}\nЧтобы напомнить о долге.`
      kb = [[SKIP]]
      break
    case "prepay":
      html = `${head}${stepTitle(6, 7, "Предоплата")}\nСколько покупатель отдал сразу? Из ${formatMoney(s.d.salePrice)}.`
      kb = [[{ text: "Ничего не отдал", data: "skip" }]]
      break
    case "due":
      html = `${head}${stepTitle(7, 7, "Когда вернёт долг?")}`
      kb = [
        [
          { text: "Через неделю", data: "v:7" },
          { text: "Через 2 недели", data: "v:14" },
        ],
        [{ text: "Через месяц", data: "v:30" }, { text: "Без срока", data: "skip" }],
      ]
      break
    case "confirm": {
      const d = s.d
      const debt = d.paymentMethod === "DEBT" ? (d.salePrice ?? 0) - (d.paidNow ?? 0) : 0
      const profit = (d.salePrice ?? 0) - (p?.purchasePrice ?? 0)
      html = [
        "<b>Проверьте и продайте</b>",
        "",
        `📱 ${esc(p ? phoneName(p) : "")} · …${p?.imei1.slice(-4)}`,
        `Цена: <b>${formatMoney(d.salePrice)}</b> · ${PAYMENT_METHOD_LABEL[d.paymentMethod!]}`,
        `Прибыль: <b>${formatMoney(profit)}</b>${profit < 0 ? " ⚠️ в минус" : ""}`,
        d.buyerName ? `Покупатель: ${esc(d.buyerName)}${d.buyerPhone ? `, ${esc(d.buyerPhone)}` : ""}` : null,
        debt > 0 ? `Долг: <b>${formatMoney(debt)}</b>${d.dueDate ? ` до ${formatDate(ymdToDate(d.dueDate))}` : ""}` : null,
      ]
        .filter((l) => l !== null)
        .join("\n")
      await setState(ctx.user.id, s)
      return send(ctx.chatId, html, [[{ text: "✅ Продать", data: "ok" }], [CANCEL]])
    }
  }
  await setState(ctx.user.id, s)
  await send(ctx.chatId, html, [...kb, [CANCEL]])
}

export async function handleSell(ctx: Ctx, s: SellState, input: Input) {
  const text = input.kind === "text" ? input.text.trim() : ""
  const btn = input.kind === "button" ? input.data : ""
  const skip = btn === "skip"
  const pick = btn.startsWith("v:") ? btn.slice(2) : null
  const d = s.d

  switch (s.step) {
    case "pick": {
      if (btn.startsWith("pk:")) return choosePhone(ctx, s, btn.slice(3))
      if (!text) return
      const found = await searchPhones(ctx.user.id, text, "sell")
      if (found.length === 0) return send(ctx.chatId, "Не нашёл такой телефон в наличии. Проверьте IMEI или напишите модель.", [[CANCEL]])
      if (found.length === 1) return choosePhone(ctx, s, found[0].id)
      return send(ctx.chatId, `Нашёл ${found.length}. Какой?`, [...found.map((f) => [phoneButton(f, "pk")]), [CANCEL]])
    }
    case "price": {
      const n = parseMoney(text)
      if (n == null || n <= 0) return send(ctx.chatId, "Напишите цену цифрами, например <code>520000</code>.")
      d.salePrice = n
      s.step = "method"
      break
    }
    case "method":
      if (!pick || !(METHODS as readonly string[]).includes(pick)) return send(ctx.chatId, "Выберите способ оплаты кнопкой.")
      d.paymentMethod = pick as SellState["d"]["paymentMethod"]
      s.step = "buyer"
      break
    case "buyer":
      if (skip && d.paymentMethod !== "DEBT") d.buyerName = null
      else if (text && text.length <= 100) d.buyerName = text
      else return send(ctx.chatId, d.paymentMethod === "DEBT" ? "Для долга нужно имя покупателя." : "Напишите имя или нажмите «Пропустить».")
      s.step = d.paymentMethod === "DEBT" ? "buyerPhone" : "confirm"
      break
    case "buyerPhone":
      if (!skip && (!text || text.length > 50)) return send(ctx.chatId, "Напишите телефон или нажмите «Пропустить».")
      d.buyerPhone = skip ? null : text
      s.step = "prepay"
      break
    case "prepay": {
      const n = skip ? 0 : parseMoney(text)
      if (n == null) return send(ctx.chatId, "Напишите сумму цифрами или нажмите «Ничего не отдал».")
      if (n >= (d.salePrice ?? 0)) return send(ctx.chatId, "Это вся сумма — значит, не в долг. Нажмите «Отмена» и выберите способ оплаты.")
      d.paidNow = n
      s.step = "due"
      break
    }
    case "due":
      d.dueDate = pick ? dateToYmd(addDays(todayDate(), Number(pick))) : skip ? null : undefined
      if (d.dueDate === undefined) return send(ctx.chatId, "Выберите срок кнопкой.")
      s.step = "confirm"
      break
    case "confirm":
      if (btn !== "ok") return send(ctx.chatId, "Нажмите «✅ Продать» или «Отмена».")
      return save(ctx, s)
  }
  await ask(ctx, s)
}

async function save(ctx: Ctx, s: SellState) {
  const d = s.d
  const res = await sellPhoneAction(d.phoneId!, {
    salePrice: d.salePrice,
    soldAt: todayYmd(),
    buyerName: d.buyerName ?? null,
    buyerPhone: d.buyerPhone ?? null,
    paymentMethod: d.paymentMethod,
    paidNow: d.paidNow ?? 0,
    prepayMethod: "CASH",
    dueDate: d.dueDate ?? null,
    note: null,
  })
  await setState(ctx.user.id, null)
  if (!res.ok) {
    const details = Object.values(res.fieldErrors ?? {}).join("\n")
    return send(ctx.chatId, `❌ <b>Не продано:</b> ${esc(res.error)}${details ? `\n${esc(details)}` : ""}`)
  }
  const p = await loadPhone(ctx, d.phoneId!)
  const profit = (d.salePrice ?? 0) - (p?.purchasePrice ?? 0)
  await send(ctx.chatId, `✅ <b>Продано</b>\n${esc(p ? phoneName(p) : "")}\n${formatMoney(d.salePrice)} · прибыль <b>${formatMoney(profit)}</b>`, [
    [{ text: "🛡 На верификацию", data: `vp:${d.phoneId}` }],
    crmButton(`/phones/${d.phoneId}`),
  ])
}
