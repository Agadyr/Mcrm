"use client"

import { useTheme } from "next-themes"
import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react"
import { useHydrated } from "@/lib/use-hydrated"
import { cn } from "@/lib/utils"

const OPTIONS = [
  { value: "light", label: "Светлая", icon: SunIcon },
  { value: "dark", label: "Тёмная", icon: MoonIcon },
  { value: "system", label: "Системная", icon: MonitorIcon },
] as const

/** Переключатель темы. Выбор хранится в браузере, «Системная» — как настроено на телефоне или компьютере. */
export function ThemeSwitch() {
  const { theme, setTheme } = useTheme()
  // до загрузки скриптов выбранная тема неизвестна — ничего не подсвечиваем, чтобы не расходиться с сервером
  const hydrated = useHydrated()
  const current = hydrated ? (theme ?? "system") : null
  return (
    <div role="radiogroup" aria-label="Тема оформления" className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1">
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={current === value}
          onClick={() => setTheme(value)}
          className={cn(
            "flex h-9 items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition-colors",
            current === value ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Icon className="size-4" />
          {label}
        </button>
      ))}
    </div>
  )
}
