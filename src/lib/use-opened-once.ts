"use client"

import { useState } from "react"

/**
 * true, если окно хоть раз открывали. Пока нет — окно не создаётся вовсе: в списках на 50 строк
 * у каждой строки свои «Продать», «РФС», «Удалить», и держать их все готовыми — лишняя работа при загрузке.
 * После первого открытия окно остаётся, чтобы закрывалось с анимацией.
 */
export function useOpenedOnce(open: boolean) {
  const [opened, setOpened] = useState(open)
  if (open && !opened) setOpened(true)
  return opened || open
}
