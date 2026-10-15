import Link from "next/link"
import { cn } from "@/lib/utils"

/** Переключатель внутри «Новой верификации»: один телефон или сразу несколько (ссылки, без JavaScript) */
export function HandoverMode({ active }: { active: "single" | "batch" }) {
  const items = [
    { key: "single", label: "Один телефон", href: "/verifications/new" },
    { key: "batch", label: "Несколько сразу", href: "/verifications/batch" },
  ] as const
  return (
    <nav aria-label="Сколько телефонов" className="mb-5 flex w-fit gap-0.5 rounded-xl bg-muted p-1">
      {items.map((i) => (
        <Link
          key={i.key}
          href={i.href}
          replace
          aria-current={active === i.key ? "page" : undefined}
          className={cn(
            "rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors",
            active === i.key ? "bg-card text-foreground shadow-sm ring-1 ring-foreground/5" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {i.label}
        </Link>
      ))}
    </nav>
  )
}
