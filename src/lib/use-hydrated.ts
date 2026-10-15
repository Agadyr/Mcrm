"use client"

import { useEffect, useState } from "react"

/** true, когда страница «ожила» (загрузились скрипты). До этого кнопки отправки форм выключены. */
export function useHydrated() {
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => setHydrated(true), [])
  return hydrated
}
