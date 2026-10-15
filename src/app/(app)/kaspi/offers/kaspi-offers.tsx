"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { CheckIcon, CopyIcon, Loader2Icon, PencilIcon, PlusIcon, RefreshCwIcon, Trash2Icon, TriangleAlertIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { KaspiMark } from "@/components/kaspi-mark"
import { formatMemory, formatMoney } from "@/lib/format"
import { cn } from "@/lib/utils"
import {
  deleteKaspiOfferAction,
  regenerateKaspiFeedAction,
  saveKaspiFeedSettingsAction,
  saveKaspiOfferAction,
  setKaspiOfferActiveAction,
} from "@/server/actions/kaspi-offers"
import { KaspiTabs } from "../kaspi-tabs"

export type OfferRow = {
  id: string
  sku: string
  title: string
  brand: string | null
  model: string
  memoryGb: number | null
  color: string | null
  price: number
  preOrderDays: number | null
  active: boolean
  stock: number
}
export type Suggestion = { key: string; model: string; memoryGb: number | null; color: string | null; title: string; brand: string; count: number; maxPurchase: number }

type Draft = Partial<Omit<OfferRow, "id" | "stock">> & { id?: string }

/** Товары и цены для Kaspi: прайс-лист по ссылке, остатки — со склада CRM */
export function KaspiOffers({
  settings,
  feedUrl,
  feedPath,
  offers,
  suggestions,
}: {
  settings: { merchantId: string; storeId: string }
  feedUrl: string | null
  feedPath: string | null
  offers: OfferRow[]
  suggestions: Suggestion[]
}) {
  const [draft, setDraft] = useState<Draft | null>(null)
  const configured = !!feedPath

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-4">
        <div className="flex items-center gap-3.5">
          <KaspiMark className="size-12" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Товары и цены</h1>
            <p className="text-sm text-muted-foreground">Kaspi забирает цены и остатки по ссылке раз в час. Продали телефон — остаток в Kaspi уменьшится сам.</p>
          </div>
        </div>
        <KaspiTabs active="offers" />
      </header>

      <FeedSettings settings={settings} feedUrl={feedUrl} feedPath={feedPath} />

      <section className="overflow-hidden rounded-2xl border bg-card shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
          <div>
            <h2 className="text-[15px] font-semibold">Товары в прайс-листе</h2>
            <p className="text-[13px] text-muted-foreground">Артикул должен совпадать с артикулом товара в кабинете Kaspi.</p>
          </div>
          <Button onClick={() => setDraft({ active: true })} disabled={!configured}>
            <PlusIcon /> Добавить товар
          </Button>
        </div>
        {offers.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">
            {configured ? "Пока пусто. Добавьте товар или выберите модель со склада ниже." : "Сначала заполните настройки прайс-листа выше."}
          </p>
        ) : (
          <ul className="divide-y">
            {offers.map((o) => (
              <OfferItem key={o.id} offer={o} onEdit={() => setDraft(o)} />
            ))}
          </ul>
        )}
      </section>

      {configured && suggestions.length > 0 && (
        <section className="rounded-2xl border bg-card shadow-xs">
          <div className="border-b px-5 py-4">
            <h2 className="text-[15px] font-semibold">Есть на складе, но нет в прайсе</h2>
            <p className="text-[13px] text-muted-foreground">Добавьте модель — останется указать артикул из кабинета Kaspi и цену.</p>
          </div>
          <ul className="divide-y">
            {suggestions.map((s) => (
              <li key={s.key} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{s.title}</div>
                  <div className="text-xs text-muted-foreground">
                    В наличии {s.count} шт. · закупка до {formatMoney(s.maxPurchase)}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDraft({ title: s.title, brand: s.brand, model: s.model, memoryGb: s.memoryGb, color: s.color, active: true })}
                >
                  <PlusIcon /> В прайс
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {draft && <OfferDialog draft={draft} onClose={() => setDraft(null)} />}
    </div>
  )
}

function FeedSettings({ settings, feedUrl, feedPath }: { settings: { merchantId: string; storeId: string }; feedUrl: string | null; feedPath: string | null }) {
  const router = useRouter()
  const [merchantId, setMerchantId] = useState(settings.merchantId)
  const [storeId, setStoreId] = useState(settings.storeId || "PP1")
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [pending, startTransition] = useTransition()
  const [copied, setCopied] = useState(false)
  const [regenOpen, setRegenOpen] = useState(false)

  function save(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const r = await saveKaspiFeedSettingsAction({ merchantId, storeId })
      if (!r.ok) {
        setErrors(r.fieldErrors ?? {})
        return void toast.error(r.error)
      }
      setErrors({})
      toast.success("Сохранено")
      router.refresh()
    })
  }

  async function copy() {
    if (!feedUrl) return
    await navigator.clipboard.writeText(feedUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <section className="rounded-2xl border bg-card p-5 shadow-xs">
      <h2 className="text-[15px] font-semibold">Прайс-лист для Kaspi</h2>
      <form onSubmit={save} className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">ID магазина в Kaspi</span>
          <Input value={merchantId} onChange={(e) => setMerchantId(e.target.value)} placeholder="Например, 30123456" aria-invalid={!!errors.merchantId} />
          <span className={cn("text-xs", errors.merchantId ? "text-destructive" : "text-muted-foreground")}>{errors.merchantId ?? "Есть в кабинете продавца, в профиле магазина"}</span>
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">Код склада</span>
          <Input value={storeId} onChange={(e) => setStoreId(e.target.value)} placeholder="PP1" aria-invalid={!!errors.storeId} />
          <span className={cn("text-xs", errors.storeId ? "text-destructive" : "text-muted-foreground")}>{errors.storeId ?? "Кабинет Kaspi → «Склады и магазины»"}</span>
        </label>
        <Button type="submit" disabled={pending} className="sm:mb-5">
          {pending && <Loader2Icon className="animate-spin" />} Сохранить
        </Button>
      </form>

      {feedPath && (
        <div className="mt-4 rounded-xl bg-muted/50 p-4">
          <div className="text-sm font-medium">Ссылка на прайс-лист</div>
          {feedUrl ? (
            <div className="mt-2 flex gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg border bg-card px-3 py-2 text-xs">{feedUrl}</code>
              <Button variant="outline" onClick={copy}>
                {copied ? <CheckIcon /> : <CopyIcon />} {copied ? "Скопировано" : "Копировать"}
              </Button>
            </div>
          ) : (
            <div className="mt-2 flex gap-2 rounded-lg bg-amber-50 p-3 text-[13px] text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
              <div>
                Kaspi не сможет забрать прайс с компьютера: нужен адрес сайта в интернете. Укажите его в настройке <code>APP_URL</code> (например, https://crm.example.kz) — здесь
                появится ссылка. Сейчас прайс открывается только у вас: <a href={feedPath} target="_blank" rel="noreferrer" className="underline">посмотреть файл</a>.
              </div>
            </div>
          )}
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-[13px] text-muted-foreground">
            <li>Скопируйте ссылку.</li>
            <li>
              Кабинет Kaspi → <b className="text-foreground">Товары</b> → <b className="text-foreground">Загрузить прайс-лист</b> → <b className="text-foreground">Автоматическая загрузка</b> — вставьте ссылку.
            </li>
            <li>Kaspi будет проверять прайс каждые 60 минут и обновлять цены и остатки, если они изменились.</li>
          </ol>
          <button type="button" onClick={() => setRegenOpen(true)} className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
            <RefreshCwIcon className="size-3.5" /> Сделать новую ссылку
          </button>
        </div>
      )}
      <ConfirmDialog
        open={regenOpen}
        onOpenChange={setRegenOpen}
        title="Сделать новую ссылку?"
        description="Старая ссылка перестанет работать — новую нужно будет вставить в кабинете Kaspi."
        confirmLabel="Сделать новую"
        onConfirm={async () => {
          await regenerateKaspiFeedAction()
          toast.success("Ссылка обновлена — вставьте её в кабинете Kaspi")
          router.refresh()
        }}
      />
    </section>
  )
}

function OfferItem({ offer: o, onEdit }: { offer: OfferRow; onEdit: () => void }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const status = !o.active ? "снят с продажи" : o.stock > 0 ? `в наличии ${o.stock} шт.` : o.preOrderDays ? `предзаказ ${o.preOrderDays} дн.` : "нет в наличии"

  function toggle() {
    startTransition(async () => {
      const r = await setKaspiOfferActiveAction(o.id, !o.active)
      if (!r.ok) return void toast.error(r.error)
      router.refresh()
    })
  }

  return (
    <li className={cn("flex flex-wrap items-center gap-3 px-5 py-3.5", !o.active && "opacity-60")}>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{o.title}</div>
        <div className="text-xs text-muted-foreground">
          <span className="font-mono">{o.sku}</span> · {[o.model, formatMemory(o.memoryGb), o.color].filter(Boolean).join(" · ")}
        </div>
      </div>
      <span
        className={cn(
          "inline-flex h-6 items-center rounded-full px-2.5 text-xs font-medium",
          !o.active ? "bg-muted text-muted-foreground" : o.stock > 0 ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300"
        )}
      >
        {status}
      </span>
      <span className="w-28 text-right text-sm font-semibold tabular-nums">{formatMoney(o.price)}</span>
      <div className="flex gap-1">
        <Button variant="ghost" size="sm" onClick={toggle} disabled={pending}>
          {o.active ? "Снять" : "Вернуть"}
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={onEdit} aria-label="Изменить">
          <PencilIcon />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={() => setDeleteOpen(true)} aria-label="Удалить" className="text-muted-foreground">
          <Trash2Icon />
        </Button>
      </div>
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Убрать товар из прайса?"
        description="При следующей загрузке прайса Kaspi перестанет получать по нему цену и остаток. Если нужно просто временно снять с продажи — нажмите «Снять»."
        confirmLabel="Убрать"
        destructive
        onConfirm={async () => {
          const r = await deleteKaspiOfferAction(o.id)
          if (!r.ok) {
            toast.error(r.error)
            return false
          }
          router.refresh()
        }}
      />
    </li>
  )
}

function OfferDialog({ draft, onClose }: { draft: Draft; onClose: () => void }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [v, setV] = useState({
    sku: draft.sku ?? "",
    title: draft.title ?? "",
    brand: draft.brand ?? "",
    model: draft.model ?? "",
    memoryGb: draft.memoryGb ? String(draft.memoryGb) : "",
    color: draft.color ?? "",
    price: draft.price ? String(draft.price) : "",
    preOrderDays: draft.preOrderDays ? String(draft.preOrderDays) : "",
  })
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV((s) => ({ ...s, [k]: e.target.value }))

  function submit(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const r = await saveKaspiOfferAction(draft.id ?? null, { ...v, active: draft.active ?? true })
      if (!r.ok) {
        setErrors(r.fieldErrors ?? {})
        return void toast.error(r.error)
      }
      toast.success(draft.id ? "Товар сохранён" : "Товар добавлен в прайс")
      onClose()
      router.refresh()
    })
  }

  const field = (k: keyof typeof v, label: string, props: React.ComponentProps<typeof Input> = {}, hint?: string) => (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium">{label}</span>
      <Input value={v[k]} onChange={set(k)} aria-invalid={!!errors[k]} {...props} />
      {(errors[k] || hint) && <span className={cn("text-xs", errors[k] ? "text-destructive" : "text-muted-foreground")}>{errors[k] ?? hint}</span>}
    </label>
  )

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{draft.id ? "Товар в прайсе" : "Добавить товар в прайс"}</DialogTitle>
            <DialogDescription>Остаток посчитается сам: телефоны «В наличии» с этой моделью, памятью и цветом.</DialogDescription>
          </DialogHeader>
          {field("sku", "Артикул в Kaspi", { placeholder: "Например, 123456789", className: "font-mono", autoFocus: !draft.sku }, "Как у товара в кабинете Kaspi")}
          {field("title", "Название для Kaspi", { placeholder: "Apple iPhone 15 Pro 256GB" })}
          <div className="grid grid-cols-2 gap-3">
            {field("price", "Цена, ₸", { inputMode: "numeric", placeholder: "589000" })}
            {field("brand", "Бренд", { placeholder: "Apple" })}
          </div>
          <div className="rounded-xl bg-muted/50 p-3">
            <div className="mb-2 text-xs font-medium text-muted-foreground">Какие телефоны склада считать</div>
            <div className="grid gap-3 sm:grid-cols-3">
              {field("model", "Модель", { placeholder: "iPhone 15 Pro" })}
              {field("memoryGb", "Память, ГБ", { inputMode: "numeric", placeholder: "любая" })}
              {field("color", "Цвет", { placeholder: "любой" })}
            </div>
          </div>
          {field("preOrderDays", "Предзаказ, дней", { inputMode: "numeric", placeholder: "нет" }, "Если телефонов нет — Kaspi покажет предзаказ (до 30 дней). Пусто — товар просто закончится.")}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
              Закрыть
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2Icon className="animate-spin" />} Сохранить
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
