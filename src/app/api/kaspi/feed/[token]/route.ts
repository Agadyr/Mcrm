import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { buildKaspiFeed } from "@/server/kaspi-feed"

// Прайс-лист для Kaspi: ссылку из раздела «Товары и цены» вставляют в кабинете продавца
// (Товары → Загрузить прайс-лист → Автоматическая загрузка). Доступ — по секрету в адресе.

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const clean = token.replace(/\.xml$/, "")
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(clean)) return new NextResponse("Not found", { status: 404 })
  const shop = await prisma.kaspiShop.findUnique({ where: { feedToken: clean }, select: { ownerId: true } })
  if (!shop) return new NextResponse("Not found", { status: 404 })
  return new NextResponse(await buildKaspiFeed(shop.ownerId), {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "no-store" },
  })
}
