"use client"

import { useEffect, useRef, useState } from "react"
import { UserIcon } from "lucide-react"
import { Input } from "@/components/ui/input"
import { formatCustomerPhone } from "@/lib/customers"
import { cn } from "@/lib/utils"
import { searchCustomersAction, type CustomerSuggestion } from "@/server/actions/customers"

/**
 * Поле «Покупатель» / «Телефон покупателя» с подсказками из базы клиентов (по имени или части номера).
 * Выбор клиента заполняет оба поля — продажа привяжется к нему по номеру.
 */
export function CustomerAutocomplete({
  value,
  onChange,
  onPick,
  className,
  ...props
}: Omit<React.ComponentProps<"input">, "value" | "onChange"> & {
  value: string
  onChange: (value: string) => void
  onPick: (customer: CustomerSuggestion) => void
}) {
  const [items, setItems] = useState<CustomerSuggestion[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  // подсказки ищем только после ввода, а не когда поле заполнили выбором
  const typed = useRef(false)

  useEffect(() => {
    const q = value.trim()
    if (!typed.current || q.length < 2) {
      setItems([])
      return
    }
    let cancelled = false
    const t = setTimeout(async () => {
      const found = await searchCustomersAction(q).catch(() => [])
      if (!cancelled) {
        setItems(found)
        setActive(-1)
      }
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [value])

  function pick(c: CustomerSuggestion) {
    typed.current = false
    setOpen(false)
    setItems([])
    onPick(c)
  }

  const shown = open && items.length > 0
  return (
    <div className="relative">
      <Input
        {...props}
        className={className}
        autoComplete="off"
        value={value}
        role="combobox"
        aria-expanded={shown}
        aria-autocomplete="list"
        onChange={(e) => {
          typed.current = true
          setOpen(true)
          onChange(e.target.value)
        }}
        onFocus={() => setOpen(true)}
        // даём сработать клику по подсказке до закрытия списка
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (!shown) return
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault()
            const step = e.key === "ArrowDown" ? 1 : -1
            setActive((i) => (i + step + items.length) % items.length)
          } else if (e.key === "Enter" && active >= 0) {
            e.preventDefault()
            pick(items[active])
          } else if (e.key === "Escape") {
            e.stopPropagation()
            setOpen(false)
          }
        }}
      />
      {shown && (
        <ul role="listbox" className="absolute inset-x-0 top-full z-50 mt-1 overflow-hidden rounded-lg border bg-popover py-1 text-sm shadow-md">
          {items.map((c, i) => (
            <li key={c.id} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(c)}
                className={cn("flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted", i === active && "bg-muted")}
              >
                <UserIcon className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate font-medium">{c.name}</span>
                {c.phone && <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{formatCustomerPhone(c.phone)}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
