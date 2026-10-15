import "server-only"
import { headers } from "next/headers"
import { userAgent } from "next/server"
import { cn } from "@/lib/utils"

// Списки (товары, продажи, верификации) на компьютере — таблица, на телефоне — карточки.
// Раньше в страницу попадали оба вида, а лишний прятался CSS: страница была вдвое тяжелее.
// Теперь сервер по браузеру отдаёт только нужный вид; если браузер не распознан — оба, как раньше.

export type ListLayout = "table" | "cards" | "both"

export async function getListLayout(): Promise<ListLayout> {
  const ua = userAgent({ headers: await headers() })
  if (!ua.ua || ua.isBot) return "both"
  if (ua.device.type === "mobile") return "cards"
  if (ua.device.type === "tablet") return "both"
  return "table"
}

/** Классы обёрток: при обоих видах — переключение по ширине экрана, при одном — показываем его всегда */
export function listClasses(layout: ListLayout) {
  return {
    showTable: layout !== "cards",
    showCards: layout !== "table",
    // единственная таблица в узком окне компьютера — с прокруткой вбок, а не обрезанная
    table: cn("rounded-2xl border bg-card shadow-xs", layout === "both" ? "hidden overflow-hidden md:block" : "overflow-x-auto"),
    cards: cn("flex flex-col gap-3", layout === "both" && "md:hidden"),
  }
}
