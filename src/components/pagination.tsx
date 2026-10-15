import Link from "next/link"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function Pagination({
  page,
  pageCount,
  basePath,
  params,
}: {
  page: number
  pageCount: number
  basePath: string
  params: Record<string, string | undefined>
}) {
  if (pageCount <= 1) return null
  const href = (p: number) => {
    const sp = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) if (v && k !== "page") sp.set(k, v)
    if (p > 1) sp.set("page", String(p))
    const qs = sp.toString()
    return qs ? `${basePath}?${qs}` : basePath
  }
  const linkCls = buttonVariants({ variant: "outline", size: "sm" })
  return (
    <div className="mt-4 flex items-center justify-center gap-2 text-sm">
      {page > 1 ? (
        <Link href={href(page - 1)} className={linkCls}>
          <ChevronLeftIcon /> Назад
        </Link>
      ) : (
        <span className={cn(linkCls, "pointer-events-none opacity-40")}>
          <ChevronLeftIcon /> Назад
        </span>
      )}
      <span className="px-2 text-muted-foreground">
        {page} из {pageCount}
      </span>
      {page < pageCount ? (
        <Link href={href(page + 1)} className={linkCls}>
          Вперёд <ChevronRightIcon />
        </Link>
      ) : (
        <span className={cn(linkCls, "pointer-events-none opacity-40")}>
          Вперёд <ChevronRightIcon />
        </span>
      )}
    </div>
  )
}
