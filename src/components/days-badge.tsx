import { TriangleAlertIcon } from "lucide-react"
import { daysSince, OVERDUE_DAYS } from "@/lib/dates"
import { cn } from "@/lib/utils"

/** Сколько дней телефон на верификации: серый, с 7 дней — оранжевый со значком, с 14 — красный (сигнал, а не оттенок) */
export function DaysBadge({ since, className }: { since: Date; className?: string }) {
  const days = daysSince(since)
  const tone =
    days >= OVERDUE_DAYS * 2
      ? "bg-red-600 text-white ring-red-600"
      : days >= OVERDUE_DAYS
        ? "bg-orange-400 text-orange-950 ring-orange-400"
        : "bg-muted text-muted-foreground ring-transparent"
  return (
    <span
      title={days >= OVERDUE_DAYS ? "Долго в работе — стоит уточнить" : undefined}
      className={cn("inline-flex h-5 items-center gap-1 rounded-full px-2 text-[11px] font-semibold ring-1 ring-inset", tone, className)}
    >
      {days >= OVERDUE_DAYS && <TriangleAlertIcon className="size-3" />}
      {days === 0 ? "сегодня" : `${days} дн. в работе`}
    </span>
  )
}
