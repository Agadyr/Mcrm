"use client"

import * as React from "react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

function group(digits: string) {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ")
}

/** Поле суммы: сам расставляет пробелы между тысячами, справа «₸» */
export function MoneyInput({
  value,
  onChange,
  className,
  ...props
}: Omit<React.ComponentProps<"input">, "value" | "onChange"> & {
  value: string | number | null | undefined
  onChange: (value: string) => void
}) {
  const display = value == null || value === "" ? "" : group(String(value).replace(/\D/g, ""))
  return (
    <div className={cn("relative", className)}>
      <Input
        {...props}
        inputMode="numeric"
        autoComplete="off"
        value={display}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").replace(/^0+(?=\d)/, ""))}
        className="pr-7 tabular-nums"
      />
      <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-sm text-muted-foreground">
        ₸
      </span>
    </div>
  )
}
