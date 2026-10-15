"use client"

import { useState } from "react"
import { ChevronsUpDownIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

export type ComboboxItem = {
  value: string
  /** текст, по которому ищем */
  keywords: string
  /** как показать в списке */
  render: React.ReactNode
  /** как показать в кнопке, когда выбран */
  selectedLabel: React.ReactNode
  /** заголовок группы в списке (элементы с одинаковой группой идут подряд) */
  group?: string
}

/** Выпадающий список с поиском */
export function Combobox({
  id,
  items,
  value,
  onChange,
  placeholder = "Выберите…",
  searchPlaceholder = "Поиск…",
  emptyText = "Ничего не найдено",
  invalid,
  clearLabel,
}: {
  /** если задано — первым пунктом идёт «очистить» с этим текстом */
  clearLabel?: string
  id?: string
  items: ComboboxItem[]
  value: string | null | undefined
  onChange: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  invalid?: boolean
}) {
  const [open, setOpen] = useState(false)
  const selected = items.find((i) => i.value === value)
  // группы в порядке первого появления
  const groups: { heading?: string; items: ComboboxItem[] }[] = []
  for (const item of items) {
    const last = groups[groups.length - 1]
    if (last && last.heading === item.group) last.items.push(item)
    else groups.push({ heading: item.group, items: [item] })
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            id={id}
            type="button"
            variant="outline"
            aria-invalid={invalid}
            className="h-auto min-h-9 w-full justify-between py-1.5 text-left font-normal whitespace-normal md:min-h-8"
          />
        }
      >
        <span className={cn("min-w-0 flex-1", !selected && !value && "text-muted-foreground")}>
          {/* значение не из списка (например, введено раньше вручную) показываем как есть */}
          {selected ? selected.selectedLabel : value || placeholder}
        </span>
        <ChevronsUpDownIcon className="text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--anchor-width) min-w-72 p-0">
        <Command
          filter={(itemValue, search) => {
            if (itemValue === "__clear__") return search ? 0 : 1
            const item = items.find((i) => i.value === itemValue)
            const hay = (item?.keywords ?? "").toLowerCase()
            const needle = search.toLowerCase().replace(/[\s-]/g, "")
            return hay.replace(/[\s-]/g, "").includes(needle) || hay.includes(search.toLowerCase()) ? 1 : 0
          }}
        >
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            {clearLabel && value && (
              <CommandGroup>
                <CommandItem
                  value="__clear__"
                  onSelect={() => {
                    onChange("")
                    setOpen(false)
                  }}
                >
                  <span className="text-muted-foreground">{clearLabel}</span>
                </CommandItem>
              </CommandGroup>
            )}
            {groups.map((g, gi) => (
              <CommandGroup key={g.heading ?? gi} heading={g.heading}>
                {g.items.map((item) => (
                  <CommandItem
                    key={item.value}
                    value={item.value}
                    data-checked={item.value === value}
                    onSelect={() => {
                      onChange(item.value)
                      setOpen(false)
                    }}
                  >
                    <div className="min-w-0 flex-1">{item.render}</div>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
