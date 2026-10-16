import Link from "next/link"
import { BellRingIcon } from "lucide-react"
import { isTelegramConfigured } from "@/lib/telegram"

/** Подсказка на главной: подключить уведомления, если бот настроен, а пользователь ещё не подключился */
export function TelegramHint({ linked, text }: { linked: boolean; text: string }) {
  if (linked || !isTelegramConfigured()) return null
  return (
    <Link
      href="/profile#telegram"
      className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-sky-200 bg-sky-50/70 p-4 transition-colors hover:bg-sky-50 dark:border-sky-900 dark:bg-sky-950/40 dark:hover:bg-sky-950/60"
    >
      <span className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#229ED9] text-white">
          <BellRingIcon className="size-5" />
        </span>
        <span>
          <span className="block font-semibold">Подключите Telegram</span>
          <span className="block text-sm text-muted-foreground">{text}</span>
        </span>
      </span>
      <span className="shrink-0 text-sm font-medium text-primary">Подключить →</span>
    </Link>
  )
}
