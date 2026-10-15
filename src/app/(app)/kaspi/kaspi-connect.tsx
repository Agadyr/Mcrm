"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  ChevronDownIcon,
  ClipboardPasteIcon,
  ExternalLinkIcon,
  EyeIcon,
  EyeOffIcon,
  KeyRoundIcon,
  Loader2Icon,
  LockKeyholeIcon,
  RefreshCwIcon,
  TimerIcon,
  TriangleAlertIcon,
  UnplugIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { KaspiMark } from "@/components/kaspi-mark"
import { KaspiTabs } from "./kaspi-tabs"
import { formatDateTime } from "@/lib/format"
import { cn } from "@/lib/utils"
import { connectKaspiAction, disconnectKaspiAction, recheckKaspiAction } from "@/server/actions/kaspi"

const KASPI_CABINET = "https://kaspi.kz/mc/"

type Shop = {
  shopName: string | null
  tokenHint: string
  status: string
  lastError: string | null
  connectedAt: Date
  lastCheckedAt: Date | null
} | null

type Screen = "intro" | "guide" | "token" | "done"

/** Подключение Kaspi магазина: приветствие → инструкция → токен → готово; после подключения — статус */
export function KaspiConnect({ shop }: { shop: Shop }) {
  const [screen, setScreen] = useState<Screen | null>(null)
  const [connectedName, setConnectedName] = useState<string | null>(null)

  if (screen === "done") return <Done name={connectedName} onClose={() => setScreen(null)} />
  if (screen === "guide" || screen === "token") {
    return (
      <Wizard
        step={screen}
        replacing={!!shop}
        onStep={setScreen}
        onCancel={() => setScreen(null)}
        onConnected={(name) => {
          setConnectedName(name)
          setScreen("done")
        }}
      />
    )
  }
  if (shop) return <Status shop={shop} onReplace={() => setScreen("token")} />
  return <Intro onStart={() => setScreen("guide")} />
}

// ─── Приветствие ─────────────────────────────────────────────────

function Intro({ onStart }: { onStart: () => void }) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <section className="relative overflow-hidden rounded-3xl border bg-card shadow-xs">
        <div className="relative flex flex-col items-center px-6 pt-10 pb-8 text-center sm:px-10">
          <KaspiMark className="size-20" />
          <h1 className="mt-6 text-2xl font-semibold tracking-tight sm:text-3xl">Подключите Kaspi магазин</h1>
          <p className="mt-2 max-w-md text-[15px] leading-relaxed text-muted-foreground">
            Свяжите CRM с вашим магазином на Kaspi.kz. Понадобится только токен API из кабинета продавца — покажем, где его взять.
          </p>
          <Button size="lg" className="mt-7 h-12 rounded-xl px-7 text-[15px]" onClick={onStart}>
            Подключить магазин <ArrowRightIcon />
          </Button>
          <div className="mt-3 text-xs text-muted-foreground">Займёт около 2 минут</div>
        </div>
        <div className="grid border-t sm:grid-cols-3 sm:divide-x">
          <Feature icon={<TimerIcon />} title="2 минуты" text="Скопировали токен в кабинете Kaspi — вставили сюда" />
          <Feature icon={<LockKeyholeIcon />} title="Безопасно" text="Токен хранится зашифрованным и никому не показывается" />
          <Feature icon={<UnplugIcon />} title="Без обязательств" text="Отключить можно в любой момент одной кнопкой" />
        </div>
      </section>

      <section className="rounded-3xl border bg-card p-2 shadow-xs">
        <h2 className="px-4 pt-3 pb-1 text-[15px] font-semibold">Частые вопросы</h2>
        <Faq q="Что такое токен API?">
          Это ключ, по которому CRM обращается к вашему магазину на Kaspi. Его выдаёт сам Kaspi в кабинете продавца. Пароль от кабинета
          вводить не нужно.
        </Faq>
        <Faq q="Где взять токен?">
          В кабинете продавца Kaspi Магазина: «Настройки» → «Токен API» → «Сгенерировать». Пошаговая инструкция будет на следующем экране.
        </Faq>
        <Faq q="Это безопасно?">
          Токен проверяется у Kaspi и хранится в базе в зашифрованном виде. В интерфейсе видны только последние 4 символа. Если
          сгенерировать в кабинете Kaspi новый токен, старый можно заменить здесь.
        </Faq>
        <Faq q="Что будет после подключения?">
          CRM проверит связь с магазином и покажет статус подключения. Проверить связь, заменить токен или отключить магазин можно на этой
          же странице.
        </Faq>
        <Faq q="Можно ли отключить?">Да, в любой момент — кнопкой «Отключить». Токен сразу удаляется из CRM.</Faq>
      </section>
    </div>
  )
}

function Feature({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="flex gap-3 px-6 py-5 sm:flex-col sm:gap-2">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground [&_svg]:size-[18px]">
        {icon}
      </span>
      <div>
        <div className="text-sm font-semibold">{title}</div>
        <div className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{text}</div>
      </div>
    </div>
  )
}

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-2xl px-4 transition-colors open:bg-muted/50 hover:bg-muted/40">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-3.5 text-sm font-medium [&::-webkit-details-marker]:hidden">
        {q}
        <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <p className="pb-4 text-[13px] leading-relaxed text-muted-foreground">{children}</p>
    </details>
  )
}

// ─── Мастер подключения ──────────────────────────────────────────

const STEPS = [
  { key: "guide", label: "Получите токен" },
  { key: "token", label: "Вставьте токен" },
  { key: "done", label: "Готово" },
] as const

function Stepper({ current }: { current: number }) {
  return (
    <ol className="flex items-center gap-2">
      {STEPS.map((s, i) => (
        <li key={s.key} className="flex flex-1 items-center gap-2">
          <span
            className={cn(
              "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors",
              i < current ? "bg-emerald-600 text-white" : i === current ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            )}
          >
            {i < current ? <CheckIcon className="size-4" /> : i + 1}
          </span>
          <span className={cn("hidden text-xs font-medium sm:block", i === current ? "text-foreground" : "text-muted-foreground")}>{s.label}</span>
          {i < STEPS.length - 1 && <span className={cn("h-px flex-1", i < current ? "bg-emerald-600" : "bg-border")} />}
        </li>
      ))}
    </ol>
  )
}

function Wizard({
  step,
  replacing,
  onStep,
  onCancel,
  onConnected,
}: {
  step: "guide" | "token"
  replacing: boolean
  onStep: (s: Screen) => void
  onCancel: () => void
  onConnected: (name: string | null) => void
}) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <div className="flex items-center gap-3">
        <KaspiMark className="size-11" />
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{replacing ? "Новый токен Kaspi" : "Подключение Kaspi магазина"}</h1>
          <p className="text-sm text-muted-foreground">{step === "guide" ? "Шаг 1 из 3" : "Шаг 2 из 3"}</p>
        </div>
      </div>
      <Stepper current={step === "guide" ? 0 : 1} />
      {step === "guide" ? <Guide onNext={() => onStep("token")} onBack={onCancel} /> : <TokenForm onBack={() => onStep("guide")} onConnected={onConnected} />}
    </div>
  )
}

function Guide({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  return (
    <section className="rounded-3xl border bg-card p-5 shadow-xs sm:p-7">
      <h2 className="text-lg font-semibold">Как получить токен API</h2>
      <p className="mt-1 text-sm text-muted-foreground">Это делается один раз в кабинете продавца Kaspi Магазина.</p>
      <ol className="mt-6 flex flex-col gap-5">
        <GuideStep n={1} title="Откройте кабинет продавца">
          Войдите в кабинет Kaspi Магазина под владельцем магазина.
          <a
            href={KASPI_CABINET}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2.5 flex h-9 w-fit items-center gap-1.5 rounded-xl border bg-card px-3 text-sm font-medium shadow-xs transition-colors hover:bg-muted"
          >
            Открыть kaspi.kz/mc <ExternalLinkIcon className="size-3.5" />
          </a>
        </GuideStep>
        <GuideStep n={2} title="Найдите раздел с токеном">
          Откройте <b className="text-foreground">«Настройки»</b> → <b className="text-foreground">«Токен API»</b>.
        </GuideStep>
        <GuideStep n={3} title="Сгенерируйте и скопируйте токен">
          Нажмите <b className="text-foreground">«Сгенерировать токен»</b> и скопируйте его целиком — это длинная строка из букв и цифр.
        </GuideStep>
      </ol>
      <div className="mt-6 flex gap-3 rounded-2xl bg-amber-50 p-4 text-[13px] leading-relaxed text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
        <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
        <div>
          Токен даёт доступ к данным магазина — не отправляйте его в чаты и никому не передавайте. Названия пунктов в кабинете Kaspi могут
          немного отличаться.
        </div>
      </div>
      <div className="mt-7 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeftIcon /> Назад
        </Button>
        <Button onClick={onNext} className="h-11 rounded-xl px-6">
          У меня есть токен <ArrowRightIcon />
        </Button>
      </div>
    </section>
  )
}

function GuideStep({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-4">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#fff1ee] text-sm font-semibold text-[#d93a2b] dark:bg-[#3a1714] dark:text-[#ff8a75]">
        {n}
      </span>
      <div className="pt-1 text-sm leading-relaxed text-muted-foreground">
        <div className="mb-0.5 font-semibold text-foreground">{title}</div>
        <div>{children}</div>
      </div>
    </li>
  )
}

function TokenForm({ onBack, onConnected }: { onBack: () => void; onConnected: (name: string | null) => void }) {
  const [token, setToken] = useState("")
  const [shopName, setShopName] = useState("")
  const [show, setShow] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  async function paste() {
    try {
      setToken((await navigator.clipboard.readText()).trim())
      setError(null)
    } catch {
      toast.error("Браузер не дал прочитать буфер обмена — вставьте токен вручную")
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const r = await connectKaspiAction({ token, shopName })
      if (!r.ok) {
        setError(r.fieldErrors?.token ?? r.error)
        return
      }
      onConnected(shopName.trim() || null)
    })
  }

  return (
    <form onSubmit={submit} className="rounded-3xl border bg-card p-5 shadow-xs sm:p-7">
      <h2 className="text-lg font-semibold">Вставьте токен</h2>
      <p className="mt-1 text-sm text-muted-foreground">Проверим его у Kaspi и сохраним в зашифрованном виде.</p>

      <label htmlFor="kaspi-token" className="mt-6 mb-1.5 block text-sm font-medium">
        Токен API
      </label>
      <div className="relative">
        <KeyRoundIcon className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id="kaspi-token"
          value={token}
          onChange={(e) => {
            setToken(e.target.value)
            setError(null)
          }}
          type={show ? "text" : "password"}
          autoComplete="off"
          spellCheck={false}
          placeholder="Вставьте токен из кабинета Kaspi"
          aria-invalid={!!error}
          className="h-12 rounded-xl pr-24 pl-10 font-mono text-sm"
        />
        <div className="absolute top-1/2 right-2 flex -translate-y-1/2 gap-1">
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            aria-label={show ? "Скрыть токен" : "Показать токен"}
            className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {show ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
          </button>
          <button
            type="button"
            onClick={paste}
            aria-label="Вставить из буфера"
            title="Вставить из буфера"
            className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ClipboardPasteIcon className="size-4" />
          </button>
        </div>
      </div>
      {error && (
        <div className="mt-2.5 flex gap-2 rounded-xl bg-destructive/10 px-3 py-2.5 text-[13px] text-destructive">
          <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
          {error}
        </div>
      )}

      <label htmlFor="kaspi-name" className="mt-5 mb-1.5 block text-sm font-medium">
        Название магазина <span className="font-normal text-muted-foreground">— необязательно</span>
      </label>
      <Input
        id="kaspi-name"
        value={shopName}
        onChange={(e) => setShopName(e.target.value)}
        placeholder="Например, Gold Service"
        maxLength={100}
        className="h-11 rounded-xl"
      />

      <div className="mt-7 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        <Button type="button" variant="ghost" onClick={onBack} disabled={pending}>
          <ArrowLeftIcon /> Где взять токен
        </Button>
        <Button type="submit" disabled={pending || token.trim().length === 0} className="h-11 rounded-xl px-6">
          {pending ? (
            <>
              <Loader2Icon className="animate-spin" /> Проверяем у Kaspi…
            </>
          ) : (
            <>
              Проверить и подключить <ArrowRightIcon />
            </>
          )}
        </Button>
      </div>
    </form>
  )
}

// ─── Готово ──────────────────────────────────────────────────────

function Done({ name, onClose }: { name: string | null; onClose: () => void }) {
  const router = useRouter()
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <Stepper current={2} />
      <section className="flex flex-col items-center rounded-3xl border bg-card px-6 py-12 text-center shadow-xs">
        <span className="relative flex size-20 items-center justify-center">
          <span className="relative flex size-20 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
            <CheckIcon className="size-10" strokeWidth={2.5} />
          </span>
        </span>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">Магазин подключён</h1>
        <p className="mt-2 max-w-sm text-[15px] text-muted-foreground">
          {name ? <b className="text-foreground">{name}</b> : "Kaspi магазин"} связан с CRM. Kaspi принял токен — всё работает.
        </p>
        <Button
          className="mt-7 h-11 rounded-xl px-8"
          onClick={() => {
            onClose()
            router.refresh()
          }}
        >
          Готово
        </Button>
      </section>
    </div>
  )
}

// ─── Подключено: статус ──────────────────────────────────────────

function Status({ shop, onReplace }: { shop: NonNullable<Shop>; onReplace: () => void }) {
  const router = useRouter()
  const [checking, startCheck] = useTransition()
  const [disconnectOpen, setDisconnectOpen] = useState(false)
  const ok = shop.status === "ACTIVE"

  function recheck() {
    startCheck(async () => {
      const r = await recheckKaspiAction()
      if (!r.ok) return void toast.error(r.error)
      if (r.data.ok) toast.success("Связь с Kaspi в порядке")
      else toast.error(r.data.message ?? "Kaspi не ответил")
      router.refresh()
    })
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <KaspiTabs active="settings" />
      <section className="overflow-hidden rounded-3xl border bg-card shadow-xs">
        <div className="relative flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:p-7">
          <KaspiMark className="size-16" />
          <div className="relative min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-semibold tracking-tight">{shop.shopName || "Kaspi магазин"}</h1>
              <span
                className={cn(
                  "inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold",
                  ok ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
                )}
              >
                <span className={cn("size-1.5 rounded-full", ok ? "bg-emerald-500" : "bg-rose-500")} />
                {ok ? "Подключён" : "Токен не работает"}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Магазин на Kaspi.kz связан с CRM</p>
          </div>
        </div>

        {!ok && (
          <div className="mx-6 mb-6 flex flex-col gap-3 rounded-2xl bg-rose-50 p-4 text-sm text-rose-900 sm:mx-7 sm:flex-row sm:items-center dark:bg-rose-950/40 dark:text-rose-200">
            <TriangleAlertIcon className="size-5 shrink-0" />
            <div className="flex-1">{shop.lastError || "Kaspi больше не принимает этот токен. Возможно, в кабинете сгенерировали новый."}</div>
            <Button onClick={onReplace} className="shrink-0">
              Вставить новый токен
            </Button>
          </div>
        )}

        <dl className="grid border-t sm:grid-cols-3 sm:divide-x">
          <Info label="Токен" value={<span className="font-mono tracking-wider">••••{shop.tokenHint}</span>} />
          <Info label="Подключён" value={formatDateTime(shop.connectedAt)} />
          <Info label="Последняя проверка" value={shop.lastCheckedAt ? formatDateTime(shop.lastCheckedAt) : "—"} />
        </dl>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <Action icon={checking ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />} title="Проверить связь" text="Спросим у Kaspi, работает ли токен" onClick={recheck} disabled={checking} />
        <Action icon={<KeyRoundIcon />} title="Заменить токен" text="Если сгенерировали новый в кабинете" onClick={onReplace} />
        <Action icon={<UnplugIcon />} title="Отключить" text="Токен сразу удалится из CRM" onClick={() => setDisconnectOpen(true)} danger />
      </section>

      <ConfirmDialog
        open={disconnectOpen}
        onOpenChange={setDisconnectOpen}
        title="Отключить Kaspi магазин?"
        description="Токен удалится из CRM. Подключить снова можно в любой момент — понадобится токен из кабинета Kaspi."
        confirmLabel="Отключить"
        destructive
        onConfirm={async () => {
          const r = await disconnectKaspiAction()
          if (!r.ok) {
            toast.error(r.error)
            return false
          }
          toast.success("Kaspi магазин отключён")
          router.refresh()
        }}
      />
    </div>
  )
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="px-6 py-4 sm:px-7">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-medium">{value}</dd>
    </div>
  )
}

function Action({
  icon,
  title,
  text,
  onClick,
  disabled,
  danger,
}: {
  icon: React.ReactNode
  title: string
  text: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="group flex items-start gap-3 rounded-2xl border bg-card p-4 text-left shadow-xs transition-all hover:-translate-y-0.5 hover:shadow-md disabled:opacity-60"
    >
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-xl [&_svg]:size-[18px]",
          danger ? "bg-destructive/10 text-destructive" : "bg-muted text-foreground"
        )}
      >
        {icon}
      </span>
      <div>
        <div className={cn("text-sm font-semibold", danger && "text-destructive")}>{title}</div>
        <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{text}</div>
      </div>
    </button>
  )
}
