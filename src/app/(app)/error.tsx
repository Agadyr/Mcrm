"use client"

import { useEffect } from "react"
import Link from "next/link"
import { RotateCwIcon, TriangleAlertIcon } from "lucide-react"
import { EmptyState } from "@/components/page-header"
import { Button, buttonVariants } from "@/components/ui/button"

/** Ошибка на странице внутри приложения: меню остаётся, можно повторить или уйти на главную.
 *  На сервере ошибку уже записал onRequestError (src/instrumentation.ts), здесь — только в консоль браузера. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <EmptyState icon={<TriangleAlertIcon className="size-6" />}>
      <p className="text-base font-medium text-foreground">Что-то пошло не так</p>
      <p className="mt-1">Страница не загрузилась. Попробуйте ещё раз — если ошибка повторится, сообщите код ниже.</p>
      {error.digest && <p className="mt-2 font-mono text-xs">Код: {error.digest}</p>}
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <Button onClick={reset}>
          <RotateCwIcon /> Повторить
        </Button>
        <Link href="/" className={buttonVariants({ variant: "outline" })}>
          На главную
        </Link>
      </div>
    </EmptyState>
  )
}
