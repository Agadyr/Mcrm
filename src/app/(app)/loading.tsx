import { Skeleton } from "@/components/ui/skeleton"

/** Заготовка страницы, пока сервер собирает данные — вместо белого экрана */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Загрузка">
      <Skeleton className="mb-2 h-8 w-48 rounded-lg" />
      <Skeleton className="mb-6 h-4 w-72 rounded-md" />
      <div className="mb-4 flex gap-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-9 w-24 rounded-full" />
        ))}
      </div>
      <div className="flex flex-col gap-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-20 w-full rounded-2xl" />
        ))}
      </div>
    </div>
  )
}
