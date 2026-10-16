"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { BellRingIcon, CheckCircle2Icon, Loader2Icon, SendIcon, UnlinkIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { formatDateTime } from "@/lib/format"
import {
  checkTelegramLinkAction,
  sendTestTelegramAction,
  setMorningReminderAction,
  startTelegramLinkAction,
  unlinkTelegramAction,
} from "@/server/actions/telegram"

const POLL_MS = 3000
const POLL_LIMIT_MS = 3 * 60_000

const BOT_FEATURES = "А в самом боте можно добавлять телефоны на склад, продавать, отдавать на верификацию и искать по IMEI."

/** Подключение уведомлений в Telegram: ссылка на бота → ждём «Start» → готово */
export function TelegramCard({
  configured,
  linkedAt,
  isAdmin,
  role,
  morningReminder = true,
}: {
  configured: boolean
  linkedAt: Date | null
  isAdmin: boolean
  role: "ADMIN" | "USER" | "VERIFIER"
  /** утреннее напоминание о просроченных долгах и долгих верификациях (только компаниям) */
  morningReminder?: boolean
}) {
  const router = useRouter()
  const [waiting, setWaiting] = useState(false)
  const [pending, startTransition] = useTransition()
  const [unlinkOpen, setUnlinkOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current)
  }, [])

  function stopWaiting() {
    if (timer.current) clearInterval(timer.current)
    timer.current = null
    setWaiting(false)
  }

  async function connect() {
    // окно открываем сразу по клику (иначе браузер заблокирует), адрес подставим, когда получим ссылку
    const win = window.open("about:blank", "_blank")
    const r = await startTelegramLinkAction()
    if (!r.ok) {
      win?.close()
      toast.error(r.error)
      return
    }
    if (win) win.location.href = r.data.url
    else window.location.href = r.data.url
    setWaiting(true)
    const started = Date.now()
    timer.current = setInterval(async () => {
      const c = await checkTelegramLinkAction()
      if (c.ok && c.data.linked) {
        stopWaiting()
        toast.success("Telegram подключён")
        router.refresh()
      } else if (Date.now() - started > POLL_LIMIT_MS) {
        stopWaiting()
        toast.error("Не дождались подтверждения. Нажмите «Подключить» ещё раз.")
      }
    }, POLL_MS)
  }

  const what =
    role === "VERIFIER"
      ? "новый телефон (или несколько) от компании"
      : "верификатор закончил телефон (верифицирован или отказ)" + (isAdmin ? ", новые заявки верификаторов" : "")

  if (!configured) {
    return (
      <div className="rounded-xl bg-muted/60 p-3 text-sm text-muted-foreground">
        {isAdmin ? (
          <>
            Бот ещё не подключён. Создайте бота в Telegram через <b>@BotFather</b> (команда <code>/newbot</code>) и впишите
            токен в <code>.env</code>: <code>TELEGRAM_BOT_TOKEN=…</code>, затем перезапустите сайт.
          </>
        ) : (
          "Уведомления в Telegram пока не настроены администратором."
        )}
      </div>
    )
  }

  if (linkedAt) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-start gap-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
          <CheckCircle2Icon className="mt-0.5 size-5 shrink-0 text-emerald-700 dark:text-emerald-400" />
          <div>
            <div className="font-medium">Подключено</div>
            <div className="text-emerald-800/80 dark:text-emerald-200/80">
              С {formatDateTime(linkedAt)}. Приходят уведомления: {what}.
            </div>
            {role !== "VERIFIER" && <div className="mt-1 text-emerald-800/80 dark:text-emerald-200/80">{BOT_FEATURES}</div>}
          </div>
        </div>
        {role !== "VERIFIER" && <MorningReminderToggle enabled={morningReminder} />}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await sendTestTelegramAction()
                if (r.ok) toast.success("Отправили — проверьте Telegram")
                else toast.error(r.error)
              })
            }
          >
            <SendIcon /> Тестовое сообщение
          </Button>
          <Button variant="ghost" className="text-muted-foreground" onClick={() => setUnlinkOpen(true)}>
            <UnlinkIcon /> Отключить
          </Button>
        </div>
        <ConfirmDialog
          open={unlinkOpen}
          onOpenChange={setUnlinkOpen}
          title="Отключить Telegram?"
          description="Уведомления перестанут приходить. Подключить снова можно в любой момент."
          confirmLabel="Отключить"
          onConfirm={async () => {
            await unlinkTelegramAction()
            toast.success("Telegram отключён")
            router.refresh()
          }}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Сообщим в Telegram, когда {what}.{role !== "VERIFIER" && <> {BOT_FEATURES}</>}
      </p>
      {waiting ? (
        <div className="flex items-start gap-3 rounded-xl bg-secondary p-3 text-sm">
          <Loader2Icon className="mt-0.5 size-5 shrink-0 animate-spin text-primary" />
          <div>
            <div className="font-medium">Ждём подтверждения…</div>
            <div className="text-muted-foreground">В открывшемся Telegram нажмите <b>Start</b> (Запустить). Эта страница обновится сама.</div>
            <button type="button" className="mt-1 text-xs text-muted-foreground underline" onClick={stopWaiting}>
              Отмена
            </button>
          </div>
        </div>
      ) : (
        <Button onClick={connect} className="self-start bg-[#229ED9] text-white hover:bg-[#229ED9]/90">
          <BellRingIcon /> Подключить Telegram
        </Button>
      )}
    </div>
  )
}

/** Переключатель утреннего напоминания: просроченные долги и телефоны, которые долго на верификации */
function MorningReminderToggle({ enabled }: { enabled: boolean }) {
  const [value, setValue] = useState(enabled)
  const [pending, startTransition] = useTransition()
  return (
    <label className="flex cursor-pointer items-start gap-2.5 text-sm">
      <Checkbox
        className="mt-0.5"
        checked={value}
        disabled={pending}
        onCheckedChange={(c) => {
          const next = !!c
          setValue(next)
          startTransition(async () => {
            const r = await setMorningReminderAction(next)
            if (!r.ok) {
              setValue(!next)
              toast.error(r.error)
            }
          })
        }}
      />
      <span>
        <span className="block font-medium">Утреннее напоминание</span>
        <span className="block text-muted-foreground">
          Раз в день утром: просроченные долги покупателей и телефоны, которые дольше 14 дней на верификации. Если всё в
          порядке — не пишем.
        </span>
      </span>
    </label>
  )
}
