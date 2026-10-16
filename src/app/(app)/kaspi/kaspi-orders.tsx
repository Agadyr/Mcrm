"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  BanknoteIcon,
  CheckIcon,
  ExternalLinkIcon,
  FileTextIcon,
  Loader2Icon,
  MapPinIcon,
  PackageCheckIcon,
  PackageIcon,
  PhoneIcon,
  RefreshCwIcon,
  ShoppingBagIcon,
  SmartphoneIcon,
  TriangleAlertIcon,
  TruckIcon,
  XIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { EmptyState } from "@/components/page-header"
import { KaspiMark } from "@/components/kaspi-mark"
import { KaspiTabs } from "./kaspi-tabs"
import { formatDateTime, formatMemory, formatMoney } from "@/lib/format"
import { KASPI_CANCEL_REASONS, KASPI_DELIVERY, KASPI_PAYMENT, kaspiStatus, type KaspiCancelReason, type KaspiTab } from "@/lib/kaspi-labels"
import { cn } from "@/lib/utils"
import type { KaspiEntry } from "@/server/kaspi"
import {
  acceptKaspiOrderAction,
  assembleKaspiOrderAction,
  cancelKaspiOrderAction,
  completeKaspiOrderAction,
  createSaleFromKaspiOrderAction,
  sendKaspiImeiAction,
  setKaspiAutoAcceptAction,
  syncKaspiAction,
} from "@/server/actions/kaspi"

export type OrderRow = {
  id: string
  code: string
  state: string
  status: string
  totalPrice: number
  paymentMode: string | null
  deliveryMode: string | null
  orderedAt: string
  plannedDeliveryAt: string | null
  customerName: string | null
  customerPhone: string | null
  address: string | null
  entries: KaspiEntry[]
  hasSale: boolean
  imeiRequired: boolean
  imeiSent: boolean
  waybill: string | null
  waybillNumber: string | null
  assembled: boolean
  courierAt: string | null
}
export type StockOption = { id: string; model: string; memoryGb: number | null; color: string | null; imei1: string; purchasePrice: number }
type Shop = { name: string | null; ok: boolean; autoAccept: boolean; lastSyncAt: string | null; lastSyncError: string | null }

const KASPI_CABINET = "https://kaspi.kz/mc/"
const STALE_MS = 2 * 60_000

/** Заказы Kaspi магазина: вкладки по этапам, действия по каждому заказу */
export function KaspiOrders({
  shop,
  tab,
  tabs,
  orders,
  stock,
}: {
  shop: Shop
  tab: KaspiTab
  tabs: { key: string; label: string; count: number }[]
  orders: OrderRow[]
  stock: StockOption[]
}) {
  const router = useRouter()
  const [syncing, startSync] = useTransition()
  const synced = useRef(false)

  function sync(silent: boolean) {
    startSync(async () => {
      const r = await syncKaspiAction()
      if (!r.ok) return void (silent || toast.error(r.error))
      if (!silent) toast.success(r.data.created ? `Новых заказов: ${r.data.created}` : "Новых заказов нет")
      router.refresh()
    })
  }

  // при открытии раздела подтягиваем свежие заказы, если данные старше пары минут
  useEffect(() => {
    if (synced.current) return
    synced.current = true
    if (!shop.lastSyncAt || Date.now() - +new Date(shop.lastSyncAt) > STALE_MS) sync(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [autoPending, startAuto] = useTransition()
  const [auto, setAuto] = useState(shop.autoAccept)
  function toggleAuto() {
    const next = !auto
    setAuto(next)
    startAuto(async () => {
      const r = await setKaspiAutoAcceptAction(next)
      if (!r.ok) {
        setAuto(!next)
        toast.error(r.error)
      } else toast.success(next ? "Новые заказы будут приниматься автоматически" : "Автопринятие выключено")
    })
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3.5">
          <KaspiMark className="size-12" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{shop.name || "Kaspi магазин"}</h1>
            <p className="text-sm text-muted-foreground">
              {syncing ? "Обновляем заказы…" : shop.lastSyncAt ? `Обновлено ${formatDateTime(new Date(shop.lastSyncAt))}` : "Заказы ещё не загружались"}
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={() => sync(false)} disabled={syncing}>
          {syncing ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />} Обновить
        </Button>
      </header>
      <KaspiTabs active="orders" />

      {(!shop.ok || shop.lastSyncError) && (
        <div className="flex flex-col gap-3 rounded-2xl bg-rose-50 p-4 text-sm text-rose-900 sm:flex-row sm:items-center dark:bg-rose-950/40 dark:text-rose-200">
          <TriangleAlertIcon className="size-5 shrink-0" />
          <div className="flex-1">{shop.lastSyncError || "Kaspi не принимает токен."} Показаны заказы, загруженные ранее.</div>
          {!shop.ok && (
            <Link href="/kaspi?tab=settings" className="inline-flex h-9 shrink-0 items-center rounded-lg bg-primary px-4 font-medium text-primary-foreground hover:bg-primary/90">
              Заменить токен
            </Link>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={toggleAuto}
        disabled={autoPending}
        role="switch"
        aria-checked={auto}
        className="flex items-center gap-3 rounded-2xl border bg-card p-4 text-left shadow-xs transition-colors hover:bg-muted/40"
      >
        <span className={cn("relative h-6 w-10 shrink-0 rounded-full transition-colors", auto ? "bg-emerald-500" : "bg-muted-foreground/30")}>
          <span className={cn("absolute top-0.5 size-5 rounded-full bg-white shadow transition-all", auto ? "left-[18px]" : "left-0.5")} />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold">Принимать новые заказы автоматически</span>
          <span className="block text-xs text-muted-foreground">
            {auto
              ? "Новый заказ принимается сам, если его товары есть в «Товарах и ценах» (по артикулу) и такие телефоны есть на складе. Остальные — вручную кнопкой «Принять»; в Telegram придёт сообщение."
              : "Новые заказы нужно принимать вручную кнопкой «Принять»."}
          </span>
        </span>
      </button>

      <nav aria-label="Этапы заказов" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={`/kaspi?tab=${t.key}`}
            aria-current={t.key === tab ? "page" : undefined}
            className={cn(
              "inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors",
              t.key === tab ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {t.label}
            <span className={cn("min-w-5 rounded-full px-1.5 text-center text-xs tabular-nums", t.key === tab ? "bg-black/20" : "bg-muted")}>{t.count}</span>
          </Link>
        ))}
      </nav>

      {orders.length === 0 ? (
        <EmptyState icon={<ShoppingBagIcon className="size-6" />}>
          {tab === "NEW" ? "Новых заказов нет. Как только покупатель оформит заказ в Kaspi, он появится здесь." : "В этом разделе заказов нет."}
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-3">
          {orders.map((o) => (
            <li key={o.id}>
              <OrderCard order={o} stock={stock} />
            </li>
          ))}
        </ul>
      )}
      <p className="text-center text-xs text-muted-foreground">Kaspi отдаёт заказы за последние 14 дней.</p>
    </div>
  )
}

const TONE = {
  blue: "bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  amber: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300",
  green: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  red: "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
  gray: "bg-muted text-muted-foreground",
} as const

function OrderCard({ order: o, stock }: { order: OrderRow; stock: StockOption[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [saleOpen, setSaleOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const st = kaspiStatus(o.status)
  const [completeOpen, setCompleteOpen] = useState(false)
  const [assembleOpen, setAssembleOpen] = useState(false)
  const accepted = o.status === "ACCEPTED_BY_MERCHANT"
  const canAccept = o.state === "NEW" && o.status === "APPROVED_BY_BANK"
  const canCancel = (o.status === "APPROVED_BY_BANK" || accepted) && !o.hasSale
  // склад CRM — телефоны: продажу со склада оформляем только по заказам, где Kaspi требует IMEI (это телефоны)
  const isPhoneOrder = o.imeiRequired || o.entries.some((e) => e.imeiRequired)
  const canSell = isPhoneOrder && o.status !== "CANCELLED" && o.status !== "COMPLETED" && !o.hasSale
  // IMEI отправлен или не нужен — можно выдавать и передавать в доставку
  const imeiOk = !o.imeiRequired || o.imeiSent
  const canComplete = accepted && o.state !== "KASPI_DELIVERY" && o.state !== "NEW"
  const canAssemble = accepted && o.state === "KASPI_DELIVERY" && !o.assembled
  const needImei = o.hasSale && !o.imeiSent && (o.imeiRequired || o.entries.some((e) => e.id))

  function resendImei() {
    startTransition(async () => {
      const r = await sendKaspiImeiAction(o.id)
      if (!r.ok) return void toast.error(r.error)
      toast.success("IMEI отправлены в Kaspi")
      router.refresh()
    })
  }

  function accept() {
    startTransition(async () => {
      const r = await acceptKaspiOrderAction(o.id)
      if (!r.ok) return void toast.error(r.error)
      toast.success(`Заказ №${o.code} принят`)
      router.refresh()
    })
  }

  return (
    <article className="rounded-2xl border bg-card p-4 shadow-xs sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[15px] font-semibold">Заказ №{o.code}</h2>
            <span className={cn("inline-flex h-6 items-center rounded-full px-2.5 text-xs font-semibold", TONE[st.tone])}>{st.label}</span>
            {o.hasSale && (
              <span className="inline-flex h-6 items-center gap-1 rounded-full bg-emerald-50 px-2.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                <CheckIcon className="size-3.5" /> Продажа оформлена
              </span>
            )}
            {o.imeiSent ? (
              <span className="inline-flex h-6 items-center gap-1 rounded-full bg-emerald-50 px-2.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                <CheckIcon className="size-3.5" /> IMEI в Kaspi
              </span>
            ) : (
              o.imeiRequired &&
              o.status !== "CANCELLED" && (
                <span title="С 25.05.2025 Kaspi требует указать IMEI проданного телефона" className="inline-flex h-6 items-center gap-1 rounded-full bg-amber-100 px-2.5 text-xs font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-300">
                  <TriangleAlertIcon className="size-3.5" /> Нужен IMEI
                </span>
              )
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {formatDateTime(new Date(o.orderedAt))}
            {o.plannedDeliveryAt && ` · доставить до ${formatDateTime(new Date(o.plannedDeliveryAt)).slice(0, 10)}`}
          </p>
        </div>
        <div className="text-right">
          <div className="text-xl font-semibold tabular-nums">{formatMoney(o.totalPrice)}</div>
          <p className="text-xs text-muted-foreground">
            {[KASPI_PAYMENT[o.paymentMode ?? ""] ?? o.paymentMode, KASPI_DELIVERY[o.deliveryMode ?? ""] ?? o.deliveryMode].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>

      <ul className="mt-3 divide-y rounded-xl bg-muted/40">
        {o.entries.length === 0 ? (
          <li className="px-3 py-2.5 text-sm text-muted-foreground">Состав заказа Kaspi не прислал</li>
        ) : (
          o.entries.map((e, i) => (
            <li key={i} className="flex items-center gap-3 px-3 py-2.5 text-sm">
              <PackageIcon className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 font-medium">{e.name}</span>
              {e.quantity > 1 && <span className="text-muted-foreground tabular-nums">× {e.quantity}</span>}
              <span className="tabular-nums">{formatMoney(e.total || e.price * e.quantity)}</span>
            </li>
          ))
        )}
      </ul>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 text-sm">
          {(o.customerName || o.customerPhone) && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
              {o.customerName && <span className="font-medium">{o.customerName}</span>}
              {o.customerPhone && (
                <a href={`tel:${o.customerPhone}`} className="inline-flex items-center gap-1 text-muted-foreground hover:text-primary">
                  <PhoneIcon className="size-3.5" /> {o.customerPhone}
                </a>
              )}
            </div>
          )}
          {o.address && (
            <div className="mt-0.5 flex items-start gap-1 text-xs text-muted-foreground">
              <MapPinIcon className="mt-0.5 size-3.5 shrink-0" /> {o.address}
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {canAccept && (
            <Button onClick={accept} disabled={pending}>
              {pending ? <Loader2Icon className="animate-spin" /> : <CheckIcon />} Принять
            </Button>
          )}
          {canSell && (
            <Button variant={accepted ? "default" : "secondary"} onClick={() => setSaleOpen(true)}>
              <BanknoteIcon /> Оформить продажу
            </Button>
          )}
          {needImei && (
            <Button onClick={resendImei} disabled={pending}>
              {pending ? <Loader2Icon className="animate-spin" /> : <SmartphoneIcon />} Отправить IMEI
            </Button>
          )}
          {canComplete && (
            <Button variant={imeiOk ? "default" : "outline"} onClick={() => setCompleteOpen(true)}>
              <PackageCheckIcon /> Выдать покупателю
            </Button>
          )}
          {canAssemble && (
            <Button variant={imeiOk ? "default" : "outline"} onClick={() => setAssembleOpen(true)}>
              <TruckIcon /> Передать в Kaspi Доставку
            </Button>
          )}
          {o.assembled && (
            <a
              href={o.waybill ?? KASPI_CABINET}
              target="_blank"
              rel="noopener noreferrer"
              title={o.waybill ? "Открыть накладную" : "Kaspi не отдаёт файл накладной по API — распечатайте её в кабинете продавца"}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border bg-card px-3 text-sm font-medium shadow-xs hover:bg-muted"
            >
              <FileTextIcon className="size-4" /> {o.waybillNumber ? `Накладная №${o.waybillNumber}` : "Накладная"}
              {!o.waybill && <ExternalLinkIcon className="size-3.5 text-muted-foreground" />}
            </a>
          )}
          {canCancel && (
            <Button variant="ghost" className="text-muted-foreground" onClick={() => setCancelOpen(true)}>
              <XIcon /> Отменить
            </Button>
          )}
        </div>
      </div>

      {o.assembled && o.status === "ACCEPTED_BY_MERCHANT" && (
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-sky-50 px-3 py-2.5 text-sm text-sky-800 dark:bg-sky-950/50 dark:text-sky-200">
          <TruckIcon className="size-4 shrink-0" />
          <span>
            Передан в Kaspi Доставку
            {o.waybillNumber ? ` · накладная №${o.waybillNumber}` : " · Kaspi формирует накладную"}
            {o.courierAt && ` · передача курьеру ${formatDateTime(new Date(o.courierAt))}`}
          </span>
        </div>
      )}

      {saleOpen && <SaleDialog order={o} stock={stock} onClose={() => setSaleOpen(false)} />}
      {cancelOpen && <CancelDialog order={o} onClose={() => setCancelOpen(false)} />}
      {completeOpen && <CompleteDialog order={o} onClose={() => setCompleteOpen(false)} />}
      {assembleOpen && <AssembleDialog order={o} onClose={() => setAssembleOpen(false)} />}
    </article>
  )
}

/** Выбор телефона со склада: подходящие по названию заказа — первыми */
function SaleDialog({ order, stock, onClose }: { order: OrderRow; stock: StockOption[]; onClose: () => void }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const title = order.entries.map((e) => e.name.toLowerCase()).join(" ")
  const matches = (p: StockOption) => title.includes(p.model.toLowerCase())
  const sorted = [...stock].sort((a, b) => Number(matches(b)) - Number(matches(a)))
  const [phoneId, setPhoneId] = useState(sorted.find(matches)?.id ?? "")
  const phone = stock.find((p) => p.id === phoneId)

  function submit() {
    startTransition(async () => {
      const r = await createSaleFromKaspiOrderAction(order.id, phoneId)
      if (!r.ok) return void toast.error(r.error)
      if (r.data.imei.ok) toast.success("Продажа оформлена, IMEI отправлены в Kaspi")
      else toast.warning(`Продажа оформлена, но IMEI не ушли в Kaspi: ${r.data.imei.error}. Нажмите «Отправить IMEI».`, { duration: 8000 })
      onClose()
      router.refresh()
    })
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Оформить продажу по заказу №{order.code}</DialogTitle>
          <DialogDescription>Выберите телефон со склада, который отправляете покупателю. Продажа создастся как обычно: Kaspi, {formatMoney(order.totalPrice)}. IMEI1 и IMEI2 телефона сразу уйдут в Kaspi — с 25.05.2025 это обязательно.</DialogDescription>
        </DialogHeader>
        {stock.length === 0 ? (
          <p className="rounded-xl bg-muted/60 p-4 text-sm text-muted-foreground">На складе нет телефонов в наличии. Сначала добавьте телефон в «Товарах».</p>
        ) : (
          <>
            <select
              value={phoneId}
              onChange={(e) => setPhoneId(e.target.value)}
              aria-label="Телефон со склада"
              className="h-11 w-full rounded-xl border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <option value="">Выберите телефон…</option>
              {sorted.map((p) => (
                <option key={p.id} value={p.id}>
                  {matches(p) ? "★ " : ""}
                  {[p.model, formatMemory(p.memoryGb), p.color].filter(Boolean).join(" · ")} · …{p.imei1.slice(-4)}
                </option>
              ))}
            </select>
            {phone && (
              <p className="text-sm text-muted-foreground">
                Закупка {formatMoney(phone.purchasePrice)} · прибыль{" "}
                <b className={cn("tabular-nums", order.totalPrice - phone.purchasePrice < 0 ? "text-destructive" : "text-emerald-700")}>{formatMoney(order.totalPrice - phone.purchasePrice)}</b>
              </p>
            )}
          </>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Закрыть
          </Button>
          <Button onClick={submit} disabled={pending || !phoneId}>
            {pending && <Loader2Icon className="animate-spin" />} Оформить продажу
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CancelDialog({ order, onClose }: { order: OrderRow; onClose: () => void }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [reason, setReason] = useState<KaspiCancelReason | "">("")
  const [comment, setComment] = useState("")

  function submit() {
    if (!reason) return
    startTransition(async () => {
      const r = await cancelKaspiOrderAction(order.id, { reason, comment })
      if (!r.ok) return void toast.error(r.error)
      toast.success(`Заказ №${order.code} отменён`)
      onClose()
      router.refresh()
    })
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Отменить заказ №{order.code}?</DialogTitle>
          <DialogDescription>Заказ отменится в Kaspi, покупатель получит уведомление. Это нельзя вернуть.</DialogDescription>
        </DialogHeader>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Причина</legend>
          {(Object.entries(KASPI_CANCEL_REASONS) as [KaspiCancelReason, string][]).map(([key, label]) => (
            <label key={key} className={cn("flex cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-3 text-sm transition-colors", reason === key ? "border-primary bg-primary/5" : "hover:bg-muted/50")}>
              <input type="radio" name="reason" value={key} checked={reason === key} onChange={() => setReason(key)} className="accent-[var(--primary)]" />
              {label}
            </label>
          ))}
        </fieldset>
        <input
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          maxLength={200}
          placeholder="Комментарий (необязательно)"
          className="h-11 w-full rounded-xl border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Не отменять
          </Button>
          <Button variant="destructive" onClick={submit} disabled={pending || !reason}>
            {pending && <Loader2Icon className="animate-spin" />} Отменить заказ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** «Выдан» в два шага: Kaspi отправляет покупателю код в приложение, продавец вводит код, который назвал покупатель */
function CompleteDialog({ order, onClose }: { order: OrderRow; onClose: () => void }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [sent, setSent] = useState(false)
  const [code, setCode] = useState("")

  function sendCode() {
    startTransition(async () => {
      const r = await completeKaspiOrderAction(order.id)
      if (!r.ok) return void toast.error(r.error)
      setSent(true)
    })
  }
  function confirm() {
    startTransition(async () => {
      const r = await completeKaspiOrderAction(order.id, code)
      if (!r.ok) return void toast.error(r.error)
      toast.success(`Заказ №${order.code} выдан`)
      onClose()
      router.refresh()
    })
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Выдать заказ №{order.code}</DialogTitle>
          <DialogDescription>
            {sent
              ? "Kaspi отправил покупателю код в приложение Kaspi.kz. Попросите покупателя назвать код и введите его."
              : "Kaspi отправит покупателю код подтверждения в приложение Kaspi.kz. Нажмите, когда покупатель рядом."}
          </DialogDescription>
        </DialogHeader>
        {sent && (
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
            inputMode="numeric"
            autoFocus
            placeholder="Код из приложения покупателя"
            aria-label="Код подтверждения"
            className="h-12 w-full rounded-xl border bg-background px-4 text-center font-mono text-xl tracking-[0.3em] outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          />
        )}
        <DialogFooter>
          {sent && (
            <Button variant="ghost" onClick={sendCode} disabled={pending}>
              Отправить код ещё раз
            </Button>
          )}
          {sent ? (
            <Button onClick={confirm} disabled={pending || code.length < 3}>
              {pending && <Loader2Icon className="animate-spin" />} Подтвердить выдачу
            </Button>
          ) : (
            <Button onClick={sendCode} disabled={pending}>
              {pending && <Loader2Icon className="animate-spin" />} Отправить код покупателю
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Передать в Kaspi Доставку: число мест (коробок) — Kaspi сформирует накладную */
function AssembleDialog({ order, onClose }: { order: OrderRow; onClose: () => void }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [places, setPlaces] = useState(1)

  function submit() {
    startTransition(async () => {
      const r = await assembleKaspiOrderAction(order.id, places)
      if (!r.ok) return void toast.error(r.error)
      toast.success("Заказ передан в Kaspi Доставку", { description: r.data.waybillNumber ? `Накладная №${r.data.waybillNumber}` : "Kaspi формирует накладную — номер появится в заказе" })
      onClose()
      router.refresh()
    })
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Передать в Kaspi Доставку</DialogTitle>
          <DialogDescription>Заказ №{order.code} собран. Укажите, сколько мест (коробок) — Kaspi сформирует накладную для курьера.</DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-center gap-4">
          <Button variant="outline" size="icon" onClick={() => setPlaces((p) => Math.max(1, p - 1))} aria-label="Меньше">
            −
          </Button>
          <span className="w-12 text-center text-3xl font-semibold tabular-nums">{places}</span>
          <Button variant="outline" size="icon" onClick={() => setPlaces((p) => Math.min(20, p + 1))} aria-label="Больше">
            +
          </Button>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Закрыть
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending && <Loader2Icon className="animate-spin" />} Сформировать накладную
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
