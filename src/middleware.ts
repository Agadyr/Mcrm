import { NextResponse, type NextRequest } from "next/server"
import { SESSION_COOKIE, verifySession } from "@/lib/session"

// Все страницы и API закрыты без входа, кроме /login.
// Здесь проверяется только подпись токена; версию сессии (смена пароля) проверяет getCurrentUser на сервере.
const PUBLIC_FILES = ["/manifest.webmanifest", "/icon", "/apple-icon", "/icons", "/robots.txt"]

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl
  // Страница входа открыта всегда: если сессия действительна, она сама перенаправит на главную.
  // (Токен может быть подписан верно, но устареть после смены пароля — тогда нужен вход.)
  if (pathname === "/login" || pathname === "/register") return NextResponse.next()
  // Telegram присылает сюда сообщения боту; запрос проверяется секретом в самом обработчике
  if (pathname === "/api/telegram/webhook") return NextResponse.next()
  // синхронизация Kaspi по расписанию: проверяет секрет CRON_SECRET сама
  if (pathname === "/api/kaspi/sync") return NextResponse.next()
  // прайс-лист забирает сам Kaspi — доступ по секрету в адресе, проверяется в обработчике
  if (pathname.startsWith("/api/kaspi/feed/")) return NextResponse.next()
  // иконки и manifest нужны браузеру без входа (установка на телефон)
  if (PUBLIC_FILES.some((p) => pathname === p || pathname.startsWith(p + "/"))) return NextResponse.next()

  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value)

  if (!session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Требуется вход" }, { status: 401 })
    }
    const url = new URL("/login", req.url)
    if (pathname !== "/") url.searchParams.set("next", pathname + search)
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|ico|webp|wasm)$).*)"],
}
