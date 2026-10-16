import type { Metadata } from "next"
import Link from "next/link"
import { SearchXIcon } from "lucide-react"
import { EmptyState } from "@/components/page-header"
import { buttonVariants } from "@/components/ui/button"

export const metadata: Metadata = { title: "Страница не найдена" }

/** Нет такой страницы или записи (notFound() — например, чужой или удалённый телефон) */
export default function NotFound() {
  return (
    <main className="mx-auto max-w-md px-4 py-[15vh]">
      <EmptyState icon={<SearchXIcon className="size-6" />}>
        <p className="text-base font-medium text-foreground">Страница не найдена</p>
        <p className="mt-1">Возможно, запись удалена или ссылка неверная.</p>
        <Link href="/" className={buttonVariants({ className: "mt-4" })}>
          На главную
        </Link>
      </EmptyState>
    </main>
  )
}
