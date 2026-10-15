"use client"

import { Combobox } from "@/components/combobox"
import { ALL_COUNTRIES, POPULAR_COUNTRIES } from "@/lib/countries"

const POPULAR = new Set(POPULAR_COUNTRIES.map((c) => c.name))

const ITEMS = ALL_COUNTRIES.map((c) => ({
  value: c.name,
  keywords: `${c.name} ${c.aliases ?? ""}`,
  selectedLabel: c.name,
  render: c.name,
  group: POPULAR.has(c.name) ? "Частые" : "Все страны",
}))

/** Выбор страны из списка с поиском (можно искать и латиницей: «UAE», «Dubai») */
export function CountrySelect({
  id,
  value,
  onChange,
  invalid,
}: {
  id?: string
  value: string | null | undefined
  onChange: (value: string) => void
  invalid?: boolean
}) {
  return (
    <Combobox
      id={id}
      items={ITEMS}
      value={value}
      onChange={onChange}
      invalid={invalid}
      placeholder="Выберите страну"
      searchPlaceholder="Страна или город…"
      emptyText="Страна не найдена"
      clearLabel="Не указывать"
    />
  )
}
