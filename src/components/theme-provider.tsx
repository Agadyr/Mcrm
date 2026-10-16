"use client"

import { ThemeProvider as NextThemesProvider } from "next-themes"

/** Тема оформления: светлая, тёмная или как в системе. Класс .dark ставится на <html> до отрисовки — без мигания. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </NextThemesProvider>
  )
}
