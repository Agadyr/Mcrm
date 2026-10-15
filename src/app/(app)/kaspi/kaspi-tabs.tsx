import Link from "next/link"
import { cn } from "@/lib/utils"

/** Разделы Kaspi магазина */
export function KaspiTabs({ active }: { active: "orders" | "offers" | "settings" }) {
  const items = [
    { key: "orders", label: "Заказы", href: "/kaspi" },
    { key: "offers", label: "Товары и цены", href: "/kaspi/offers" },
    { key: "settings", label: "Подключение", href: "/kaspi?tab=settings" },
  ] as const
  return (
    <nav aria-label="Разделы Kaspi" className="flex w-fit max-w-full gap-0.5 overflow-x-auto rounded-xl bg-muted p-1">
      {items.map((i) => (
        <Link
          key={i.key}
          href={i.href}
          aria-current={active === i.key ? "page" : undefined}
          className={cn(
            "rounded-lg px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
            active === i.key ? "bg-card text-foreground shadow-sm ring-1 ring-foreground/5" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {i.label}
        </Link>
      ))}
    </nav>
  )
}
