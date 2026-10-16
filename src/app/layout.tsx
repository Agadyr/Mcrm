import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { ThemeProvider } from "@/components/theme-provider"
import "./globals.css"

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin", "cyrillic"] })
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin", "cyrillic"] })

export const metadata: Metadata = {
  title: { default: "Учёт телефонов", template: "%s · Учёт телефонов" },
  description: "CRM для учёта телефонов",
  // закрытая CRM: не индексировать, даже если ссылка куда-то попадёт
  robots: { index: false, follow: false },
  applicationName: "Учёт телефонов",
  // на iPhone: «На экран Домой» открывает как приложение, без адресной строки
  appleWebApp: { capable: true, title: "Учёт телефонов", statusBarStyle: "default" },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // цвет полосы браузера: в тёмной теме — под фон страницы
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#3b5bdb" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
  viewportFit: "cover", // учитываем «чёлку» и полоску снизу на iPhone
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // suppressHydrationWarning: next-themes ставит класс темы на <html> до загрузки React
    <html lang="ru" className={`${geistSans.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <body className="antialiased">
        <ThemeProvider>
          <TooltipProvider>{children}</TooltipProvider>
          <Toaster richColors position="top-center" />
        </ThemeProvider>
      </body>
    </html>
  )
}
