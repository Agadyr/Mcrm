import "server-only"
import { prisma } from "@/lib/db"
import { todayYmd } from "@/lib/dates"
import { formatMemory, formatMoney } from "@/lib/format"
import { imeiWarning } from "@/lib/imei"
import { PHONE_CONDITION_LABEL } from "@/lib/labels"
import { createPhoneAction } from "@/server/actions/phones"
import { conflictMessage, findImeiConflicts } from "@/server/imei-conflicts"
import { extractImeis, parseMemory, parseMoney, parsePhoneText, type PhoneFields } from "./parse"
import { CANCEL, SKIP, crmButton, esc, grid, send, setState, stepTitle, type Keyboard } from "./ui"
import type { AddPhoneState, Ctx, Input } from "./types"

// «➕ Новый телефон». Два способа:
//  • одним сообщением: IMEI1, IMEI2, S/N, модель, цена… в любом порядке — бот разбирает и спрашивает только недостающее;
//  • по шагам: модель → IMEI1 → IMEI2 → S/N → память → состояние → закупка → поставщик.
// В конце — проверка, где можно поправить память, состояние, цену и поставщика.

const TOTAL = 8
const MEMORY = [64, 128, 256, 512, 1024]
type Step = AddPhoneState["step"]

/** Частые значения у этой компании среди последних поступлений — подсказки кнопками */
async function frequent(ownerId: string, field: "model" | "supplier") {
  const rows = await prisma.phone.findMany({ where: { ownerId }, select: { model: true, supplier: true }, orderBy: { receivedAt: "desc" }, take: 300 })
  const counts = new Map<string, number>()
  for (const r of rows) {
    const v = r[field]
    if (v) counts.set(v, (counts.get(v) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([v]) => v)
}

export async function startAdd(ctx: Ctx) {
  await ask(ctx, { flow: "add", step: "model", d: {} })
}

/** Быстрый режим: что ещё нужно спросить. IMEI2 и S/N спрашиваем (с «Пропустить») — без них не оформить верификацию */
function nextMissing(d: AddPhoneState["d"]): Step {
  if (!d.model) return "model"
  if (!d.imei1) return "imei1"
  if (d.imei2 === undefined) return "imei2"
  if (d.serialNumber === undefined) return "serial"
  if (d.purchasePrice === undefined) return "price"
  return "confirm"
}

const LINEAR: Step[] = ["model", "imei1", "imei2", "serial", "memory", "condition", "price", "supplier", "confirm"]

function advance(s: AddPhoneState) {
  if (s.back) {
    s.back = false
    s.step = "confirm"
  } else if (s.quick) {
    s.step = nextMissing(s.d)
  } else {
    s.step = LINEAR[LINEAR.indexOf(s.step) + 1]
    // оба IMEI прислали сразу — шаг IMEI2 не нужен
    if (s.step === "imei2" && s.d.imei2) s.step = "serial"
  }
}

const EXAMPLE = `<code>iPhone 15 Pro 256
356789000010049
356789000010056
F2LXK1Q9P3
450к</code>`

async function ask(ctx: Ctx, s: AddPhoneState, note = "") {
  const id = ctx.user.id
  const title = (n: number, t: string) => (s.quick || s.back ? `<b>${t}</b>` : stepTitle(n, TOTAL, t))
  let html = ""
  let kb: Keyboard = []
  switch (s.step) {
    case "model":
      s.opts = await frequent(id, "model")
      html = s.quick
        ? `${title(1, "Какая модель?")}\nНапишите, например <code>iPhone 15 Pro</code>${s.opts.length ? ", или выберите:" : ""}`
        : `<b>➕ Новый телефон</b>\n\nПришлите всё одним сообщением — что есть: IMEI1, IMEI2, серийный номер, модель, цену. В любом порядке, можно с подписями:\n${EXAMPLE}\n\nИли по шагам — начните с модели${s.opts.length ? " (частые — кнопками)" : ""}.`
      kb = grid(s.opts.map((m, i) => ({ text: m, data: `v:${i}` })))
      break
    case "imei1":
      html = `${title(2, "IMEI1")}\nПришлите IMEI1 — 15 цифр. Можно сразу оба IMEI и серийный номер одним сообщением.`
      break
    case "imei2":
      html = `${title(3, "IMEI2")}\nПришлите IMEI2. Он нужен для верификации.`
      kb = [[SKIP]]
      break
    case "serial":
      html = `${title(4, "Серийный номер")}\nПришлите S/N. Он тоже нужен для верификации.`
      kb = [[SKIP]]
      break
    case "memory":
      html = title(5, "Память")
      kb = [...grid(MEMORY.map((m) => ({ text: formatMemory(m), data: `v:${m}` })), 5), [SKIP]]
      break
    case "condition":
      html = title(6, "Состояние")
      kb = [[{ text: "Новый", data: "v:NEW" }, { text: "Б/у", data: "v:USED" }]]
      break
    case "price":
      html = `${title(7, "Цена закупки")}\nСколько заплатили, ₸. Например <code>450000</code> или <code>450к</code>`
      break
    case "supplier":
      s.opts = await frequent(id, "supplier")
      html = `${title(8, "Поставщик")}\nНапишите, у кого купили${s.opts.length ? ", или выберите:" : ""}`
      kb = [...grid(s.opts.map((m, i) => ({ text: m, data: `v:${i}` }))), [SKIP]]
      break
    case "confirm": {
      const used = s.d.condition === "USED"
      html = `${note}<b>Проверьте и сохраните</b>\n\n${summary(s)}\n\n<i>Если что-то не так — пришлите исправление сообщением или нажмите кнопку.</i>`
      kb = [
        [{ text: "✅ Сохранить", data: "ok" }],
        [
          { text: "💾 Память", data: "e:memory" },
          { text: "🏷 Поставщик", data: "e:supplier" },
        ],
        [
          { text: "💰 Цена", data: "e:price" },
          { text: used ? "Сделать «Новый»" : "Сделать «Б/у»", data: "e:cond" },
        ],
        [{ text: "↺ Заново", data: "m:add" }, CANCEL],
      ]
      await setState(id, s)
      await send(ctx.chatId, html, kb)
      return
    }
  }
  await setState(id, s)
  await send(ctx.chatId, note + html, [...kb, [CANCEL]])
}

function summary(s: AddPhoneState) {
  const d = s.d
  return [
    `📱 <b>${esc(d.model)}</b>${d.memoryGb ? ` · ${formatMemory(d.memoryGb)}` : ""} · ${PHONE_CONDITION_LABEL[d.condition ?? "NEW"]}`,
    `IMEI1: <code>${d.imei1}</code>`,
    `IMEI2: ${d.imei2 ? `<code>${d.imei2}</code>` : "—"}`,
    `S/N: ${d.serialNumber ? `<code>${esc(d.serialNumber)}</code>` : "—"}`,
    `Закупка: <b>${formatMoney(d.purchasePrice)}</b>`,
    `Поставщик: ${esc(d.supplier) || "—"}`,
  ].join("\n")
}

/** Проверка IMEI: только цифры, не совпадает с уже записанным */
async function imeiProblem(ctx: Ctx, imei: string, other?: string | null) {
  if (!/^\d{8,17}$/.test(imei)) return "IMEI — это 15 цифр. Пришлите ещё раз."
  if (other && other === imei) return "IMEI2 совпадает с IMEI1."
  const [conflict] = await findImeiConflicts([imei], ctx.user.id)
  return conflict ? `${conflictMessage(conflict)}. Пришлите другой IMEI.` : null
}

const warn = (imei: string) => {
  const w = imeiWarning(imei)
  return w ? `\n⚠️ ${w}` : ""
}

const FIELD_LABEL: Record<keyof PhoneFields, string> = {
  model: "модель",
  imei1: "IMEI1",
  imei2: "IMEI2",
  serialNumber: "S/N",
  memoryGb: "память",
  condition: "состояние",
  purchasePrice: "цена",
  supplier: "поставщик",
}

/** Данные из одного сообщения → в форму. Неверные IMEI не берём (их спросим), об остальном пишем, что распознали */
async function merge(ctx: Ctx, s: AddPhoneState, f: PhoneFields) {
  const problems: string[] = []
  for (const key of ["imei1", "imei2"] as const) {
    const v = f[key]
    if (!v) continue
    const p = await imeiProblem(ctx, v, key === "imei2" ? (f.imei1 ?? s.d.imei1) : f.imei2)
    if (p) {
      problems.push(`${FIELD_LABEL[key]}: ${p}`)
      delete f[key]
    } else if (warn(v)) problems.push(`${FIELD_LABEL[key]}:${warn(v)}`)
  }
  Object.assign(s.d, f)
  s.quick = true
  const got = (Object.keys(FIELD_LABEL) as (keyof PhoneFields)[]).filter((k) => f[k] !== undefined).map((k) => FIELD_LABEL[k])
  return [got.length ? `✓ Распознал: ${got.join(", ")}` : "", ...problems].filter(Boolean).join("\n") + "\n\n"
}

export async function handleAdd(ctx: Ctx, s: AddPhoneState, input: Input) {
  const text = input.kind === "text" ? input.text.trim() : ""
  const btn = input.kind === "button" ? input.data : ""
  const skip = btn === "skip"
  const pick = btn.startsWith("v:") ? btn.slice(2) : null
  const d = s.d

  // Несколько данных одним сообщением (или исправление на экране проверки) — разбираем всё сразу
  if (text) {
    const fields = parsePhoneText(text)
    const n = Object.keys(fields).length
    if (n >= 2 || (s.step === "confirm" && n >= 1)) {
      const note = await merge(ctx, s, fields)
      s.back = false
      s.opts = undefined
      s.step = nextMissing(d)
      return ask(ctx, s, note)
    }
  }

  // Кнопки «изменить» на экране проверки
  if (s.step === "confirm" && btn.startsWith("e:")) {
    const what = btn.slice(2)
    if (what === "cond") {
      d.condition = d.condition === "USED" ? "NEW" : "USED"
      return ask(ctx, s)
    }
    if (what === "memory" || what === "supplier" || what === "price") {
      s.back = true
      s.step = what
      return ask(ctx, s)
    }
  }

  switch (s.step) {
    case "model": {
      const model = pick != null ? s.opts?.[Number(pick)] : text
      if (!model || model.length > 100) return send(ctx.chatId, "Напишите модель телефона, например <code>iPhone 15 Pro</code>")
      d.model = model
      break
    }
    case "imei1": {
      const [a] = extractImeis(text)
      if (!a) return send(ctx.chatId, "Не вижу IMEI. Пришлите 15 цифр.")
      const problem = await imeiProblem(ctx, a, d.imei2)
      if (problem) return send(ctx.chatId, problem)
      d.imei1 = a
      if (warn(a)) await send(ctx.chatId, `IMEI1 принят.${warn(a)}`)
      break
    }
    case "imei2": {
      if (skip) d.imei2 = null
      else {
        const [b] = extractImeis(text)
        if (!b) return send(ctx.chatId, "Не вижу IMEI. Пришлите 15 цифр или нажмите «Пропустить».")
        const problem = await imeiProblem(ctx, b, d.imei1)
        if (problem) return send(ctx.chatId, problem)
        d.imei2 = b
        if (warn(b)) await send(ctx.chatId, `IMEI2 принят.${warn(b)}`)
      }
      break
    }
    case "serial":
      if (!skip && (!text || text.length > 50)) return send(ctx.chatId, "Пришлите серийный номер или нажмите «Пропустить».")
      d.serialNumber = skip ? null : text.replace(/\s+/g, "").toUpperCase()
      break
    case "memory": {
      const n = pick ? Number(pick) : skip ? null : parseMemory(text)
      if (n === null && !skip) return send(ctx.chatId, "Выберите объём кнопкой или напишите, например <code>256</code>.")
      d.memoryGb = n
      break
    }
    case "condition": {
      const c = pick ?? (/^б/i.test(text) ? "USED" : /^н/i.test(text) ? "NEW" : null)
      if (c !== "NEW" && c !== "USED") return send(ctx.chatId, "Выберите кнопкой: «Новый» или «Б/у».")
      d.condition = c
      break
    }
    case "price": {
      const n = parseMoney(text)
      if (n == null) return send(ctx.chatId, "Напишите сумму цифрами, например <code>450000</code>.")
      d.purchasePrice = n
      break
    }
    case "supplier": {
      const v = pick != null ? s.opts?.[Number(pick)] : skip ? null : text
      if (v === undefined || (v && v.length > 100)) return send(ctx.chatId, "Напишите поставщика или нажмите «Пропустить».")
      d.supplier = v || null
      break
    }
    case "confirm":
      if (btn !== "ok") return send(ctx.chatId, "Нажмите «✅ Сохранить» или пришлите исправление.")
      return save(ctx, s)
  }
  s.opts = undefined
  advance(s)
  await ask(ctx, s)
}

async function save(ctx: Ctx, s: AddPhoneState) {
  const d = s.d
  const res = await createPhoneAction({
    model: d.model,
    memoryGb: d.memoryGb ?? null,
    color: null,
    imei1: d.imei1,
    imei2: d.imei2 ?? null,
    serialNumber: d.serialNumber ?? null,
    condition: d.condition ?? "NEW",
    purchasePrice: d.purchasePrice ?? 0,
    receivedAt: todayYmd(),
    supplier: d.supplier ?? null,
    note: null,
    status: "IN_STOCK",
  })
  await setState(ctx.user.id, null)
  if (!res.ok) {
    const details = Object.values(res.fieldErrors ?? {}).join("\n")
    return send(ctx.chatId, `❌ <b>Не сохранено:</b> ${esc(res.error)}${details ? `\n${esc(details)}` : ""}`, [[{ text: "↺ Заново", data: "m:add" }]])
  }
  await send(ctx.chatId, `✅ <b>Телефон добавлен на склад</b>\n\n${summary(s)}`, [
    [{ text: "💰 Продать", data: `sp:${res.data.id}` }, { text: "➕ Ещё телефон", data: "m:add" }],
    crmButton(`/phones/${res.data.id}`),
  ])
}
