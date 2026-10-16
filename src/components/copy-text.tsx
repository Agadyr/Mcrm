"use client"

import { useState } from "react"
import { CheckIcon, CopyIcon } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

/**
 * Моноширинный текст (IMEI, серийник) с кнопкой «копировать».
 * label — короткая подпись слева («IMEI1», «S/N»); quiet — кнопка видна только при наведении на строку
 * таблицы (у строки должен быть класс group). На сенсорных экранах кнопка видна всегда.
 */
export function CopyText({
  value,
  className,
  label,
  quiet,
}: {
  value: string | null | undefined
  className?: string
  label?: string
  quiet?: boolean
}) {
  const [copied, setCopied] = useState(false)
  if (!value) return <span className="text-muted-foreground">—</span>

  async function copy(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(value!)
      setCopied(true)
      toast.success("Скопировано", { description: value!, duration: 1500 })
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error("Не удалось скопировать")
    }
  }

  return (
    <span className={cn("inline-flex items-center gap-1 font-mono text-[0.85em] tabular-nums", className)}>
      {label && (
        <span className="w-10 shrink-0 font-sans text-[0.7rem] font-medium tracking-wide text-muted-foreground uppercase">
          {label}
        </span>
      )}
      <span className="break-all">{value}</span>
      <button
        type="button"
        onClick={copy}
        title="Копировать"
        aria-label={`Копировать ${value}`}
        className={cn(
          "inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:opacity-100",
          quiet && !copied && "[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
        )}
      >
        {copied ? <CheckIcon className="size-3.5 text-emerald-700 dark:text-emerald-400" /> : <CopyIcon className="size-3.5" />}
      </button>
    </span>
  )
}
