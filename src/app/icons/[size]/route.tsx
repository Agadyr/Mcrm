import { appIcon } from "@/lib/app-icon"

const SIZES = new Set([192, 512])

/** Иконки для установки на телефон (manifest): /icons/192, /icons/512 */
export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const size = Number((await params).size)
  if (!SIZES.has(size)) return new Response("Not found", { status: 404 })
  return appIcon(size, { rounded: false })
}
