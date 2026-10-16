import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

// Заготовки страниц, пока сервер собирает данные. Только область контента: меню слева и панель снизу
// живут в layout и при переходе не мигают. Карточки, отступы и высоты строк — как у настоящих блоков,
// чтобы после загрузки ничего не прыгало.

const CARD = "rounded-2xl border bg-card shadow-xs"

function Busy({ children }: { children: React.ReactNode }) {
  return (
    <div aria-busy="true" aria-label="Загрузка">
      {children}
    </div>
  )
}

/** Строка текста: высота — как у строки шрифта, ширина — как у типичного текста */
function Line({ className }: { className?: string }) {
  return <Skeleton className={cn("h-4 rounded-md", className)} />
}

/** Как PageHeader: заголовок 28px, подпись и кнопки справа */
export function HeaderSkeleton({ actions = 1, back = false }: { actions?: number; back?: boolean }) {
  return (
    <div className="mb-5 flex flex-col gap-4 sm:mb-6 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {back && <Line className="mb-3 w-24" />}
        <Skeleton className="h-9 w-56 rounded-lg sm:w-64" />
        <Line className="mt-2.5 w-72 max-w-full" />
      </div>
      {actions > 0 && (
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: actions }, (_, i) => (
            <Skeleton key={i} className={cn("h-9 rounded-lg", i === actions - 1 ? "w-44" : "w-28")} />
          ))}
        </div>
      )}
    </div>
  )
}

/** Как StatusTabs: таблетки высотой 36px */
function PillsSkeleton({ count = 4 }: { count?: number }) {
  const widths = ["w-20", "w-32", "w-28", "w-36", "w-24", "w-28", "w-24"]
  return (
    <div className="flex gap-1.5 overflow-hidden">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className={cn("h-9 shrink-0 rounded-full", widths[i % widths.length])} />
      ))}
    </div>
  )
}

/** Как панель фильтров списка: вкладки и карточка с поиском */
function FiltersSkeleton({ pills }: { pills: number }) {
  return (
    <div className="mb-4 flex flex-col gap-3">
      {pills > 0 && <PillsSkeleton count={pills} />}
      <div className={cn(CARD, "flex gap-2 p-3")}>
        <Skeleton className="h-9 flex-1 rounded-lg" />
        <Skeleton className="h-9 w-11 rounded-lg sm:w-44" />
      </div>
    </div>
  )
}

/** Список: таблица на компьютере (строки по ~72px, как у настоящей) и карточки на телефоне */
export function ListSkeleton({
  actions = 1,
  filters = 4,
  search = true,
  columns = 5,
  rows = 8,
}: {
  actions?: number
  filters?: number
  search?: boolean
  columns?: number
  rows?: number
}) {
  const rest = Array.from({ length: columns - 1 })
  return (
    <Busy>
      <HeaderSkeleton actions={actions} />
      {search ? <FiltersSkeleton pills={filters} /> : filters > 0 && <div className="mb-4"><PillsSkeleton count={filters} /></div>}

      <div className={cn(CARD, "hidden overflow-hidden md:block")}>
        <div className="flex items-center gap-6 border-b bg-muted/50 px-4 py-3.5">
          <Skeleton className="h-3 w-[28%] rounded" />
          {rest.map((_, i) => (
            <Skeleton key={i} className="h-3 flex-1 rounded" />
          ))}
        </div>
        <div className="divide-y">
          {Array.from({ length: rows }, (_, r) => (
            <div key={r} className="flex min-h-18 items-center gap-6 px-4 py-3">
              <div className="w-[28%] space-y-2">
                <Line className="w-4/5" />
                <Skeleton className="h-3 w-1/2 rounded" />
              </div>
              {rest.map((_, c) =>
                c === 1 ? (
                  <div key={c} className="flex-1">
                    <Skeleton className="h-6 w-24 rounded-full" />
                  </div>
                ) : (
                  <div key={c} className="flex-1 space-y-2">
                    <Line className={c === 0 ? "w-11/12" : "ml-auto w-3/4"} />
                    {c === 0 && <Skeleton className="h-3 w-2/3 rounded" />}
                  </div>
                )
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3 md:hidden">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className={cn(CARD, "p-4")}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-2">
                <Line className="h-5 w-3/4" />
                <Skeleton className="h-3 w-1/2 rounded" />
              </div>
              <Skeleton className="h-6 w-24 shrink-0 rounded-full" />
            </div>
            <div className="mt-4 flex items-end justify-between gap-3">
              <Skeleton className="h-3 w-2/5 rounded" />
              <Line className="h-5 w-24" />
            </div>
          </div>
        ))}
      </div>
    </Busy>
  )
}

/** Заказы Kaspi: переключатель автопринятия, вкладки этапов, карточки заказов */
export function CardFeedSkeleton() {
  return (
    <Busy>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Skeleton className="size-11 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-7 w-44 rounded-lg" />
            <Line className="w-48" />
          </div>
        </div>
        <Skeleton className="h-10 w-32 rounded-xl" />
      </div>
      <Skeleton className="mb-5 h-10 w-80 max-w-full rounded-xl" />
      <div className={cn(CARD, "mb-5 flex items-center gap-4 p-4 sm:p-5")}>
        <Skeleton className="h-6 w-11 shrink-0 rounded-full" />
        <div className="flex-1 space-y-2">
          <Line className="w-72 max-w-full" />
          <Skeleton className="h-3 w-96 max-w-full rounded" />
        </div>
      </div>
      <div className="mb-5">
        <PillsSkeleton count={5} />
      </div>
      <div className="flex flex-col gap-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className={cn(CARD, "p-4 sm:p-5")}>
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Line className="h-5 w-48" />
                  <Skeleton className="h-6 w-20 rounded-full" />
                </div>
                <Skeleton className="h-3 w-56 rounded" />
              </div>
              <div className="flex flex-col items-end gap-2">
                <Skeleton className="h-7 w-24 rounded-lg" />
                <Skeleton className="h-3 w-40 rounded" />
              </div>
            </div>
            <Skeleton className="mt-3 h-11 w-full rounded-xl" />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1.5">
                <Line className="w-28" />
                <Skeleton className="h-3 w-24 rounded" />
              </div>
              <div className="flex gap-2">
                <Skeleton className="h-9 w-52 rounded-lg" />
                <Skeleton className="h-9 w-28 rounded-lg" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </Busy>
  )
}

/** Плитка главной: иконка 40px, подпись, крупная цифра, пояснение */
function StatTile({ className }: { className?: string }) {
  return (
    <div className={cn(CARD, "p-4", className)}>
      <Skeleton className="size-10 rounded-xl" />
      <Line className="mt-3 w-24" />
      <Skeleton className="mt-1.5 h-7 w-28 rounded-lg sm:h-8" />
      <Skeleton className="mt-2 h-3 w-4/5 rounded" />
    </div>
  )
}

/** Как ListCard главной: заголовок и строки с иконкой 36px */
function ListCardSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <section className={CARD}>
      <div className="flex items-center justify-between px-5 pt-4 pb-2">
        <Line className="h-5 w-44" />
        <Line className="w-10" />
      </div>
      <ul className="px-2 pb-2">
        {Array.from({ length: rows }, (_, i) => (
          <li key={i} className="flex items-center gap-3 px-3 py-2.5">
            <Skeleton className="size-9 shrink-0 rounded-xl" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Line className="w-3/5" />
              <Skeleton className="h-3 w-2/5 rounded" />
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <Line className="w-20" />
              <Skeleton className="h-3 w-14 rounded" />
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Главная: плитки с цифрами, продажи по периодам, последние продажи и поступления */
export function DashboardSkeleton() {
  return (
    <Busy>
      <HeaderSkeleton actions={2} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <StatTile key={i} className={i === 4 ? "col-span-2 sm:col-span-1" : undefined} />
        ))}
      </div>
      <section className={cn(CARD, "mt-4")}>
        <div className="flex items-center justify-between px-5 pt-4">
          <Line className="h-5 w-24" />
          <Skeleton className="size-5 rounded" />
        </div>
        <div className="grid divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="px-5 py-4">
              <Line className="w-20" />
              <Skeleton className="mt-2 h-8 w-16 rounded-lg" />
              <div className="mt-3 grid grid-cols-2 gap-2">
                {[0, 1].map((j) => (
                  <div key={j} className="space-y-1.5">
                    <Skeleton className="h-3 w-14 rounded" />
                    <Line className="w-24" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <ListCardSkeleton />
        <ListCardSkeleton />
      </div>
    </Busy>
  )
}

/** Карточка с заголовком и строками «подпись — значение», как Card на страницах записей */
function InfoCard({ rows = 5 }: { rows?: number }) {
  return (
    <div className={cn(CARD, "p-5")}>
      <Line className="h-5 w-32" />
      <div className="mt-4">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center justify-between gap-4 border-b py-2.5 last:border-0">
            <Line className="w-24" />
            <Line className={i % 2 ? "w-28" : "w-40"} />
          </div>
        ))}
      </div>
    </div>
  )
}

/** Аналитика: период, главные цифры, расчёт прибыли и таблицы */
export function AnalyticsSkeleton() {
  return (
    <Busy>
      <HeaderSkeleton actions={1} />
      <div className="mb-4">
        <PillsSkeleton count={5} />
      </div>
      <div className={cn(CARD, "overflow-hidden")}>
        <div className="grid grid-cols-2 gap-px bg-border lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="bg-card p-5">
              <Skeleton className="h-3.5 w-24 rounded" />
              <Skeleton className="mt-2.5 h-8 w-32 rounded-lg sm:h-9" />
              <Skeleton className="mt-2 h-3 w-20 rounded" />
            </div>
          ))}
        </div>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <InfoCard rows={6} />
        <InfoCard rows={6} />
      </div>
      <div className="mt-4">
        <InfoCard rows={8} />
      </div>
    </Busy>
  )
}

/** Страница записи: основные карточки слева, сводка справа */
export function DetailSkeleton() {
  return (
    <Busy>
      <HeaderSkeleton back actions={2} />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <div className="grid gap-4 md:grid-cols-2">
            <InfoCard rows={6} />
            <InfoCard rows={6} />
          </div>
          <InfoCard rows={5} />
        </div>
        <InfoCard rows={7} />
      </div>
    </Busy>
  )
}

/** Как FormSection: иконка 36px, заголовок, подсказка и поля высотой 40px */
function FormSectionSkeleton({ fields = 4 }: { fields?: number }) {
  return (
    <section className={cn(CARD, "p-4 sm:p-5")}>
      <div className="mb-4 flex items-start gap-3">
        <Skeleton className="size-9 shrink-0 rounded-xl" />
        <div className="space-y-2 pt-0.5">
          <Line className="h-5 w-40" />
          <Line className="w-64 max-w-full" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: fields }, (_, i) => (
          <div key={i} className="space-y-2">
            <Line className="w-28" />
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>
        ))}
      </div>
    </section>
  )
}

/** Форма: секции с полями и кнопка сохранения */
export function FormSkeleton({ sections = 2, columns = 1 }: { sections?: number; columns?: 1 | 2 }) {
  return (
    <Busy>
      <HeaderSkeleton back actions={0} />
      <div className={cn("grid gap-4", columns === 2 && "lg:grid-cols-2")}>
        {Array.from({ length: sections }, (_, s) => (
          <FormSectionSkeleton key={s} fields={s === 0 ? 6 : 4} />
        ))}
      </div>
      <div className="mt-4 flex justify-end">
        <Skeleton className="h-11 w-44 rounded-xl" />
      </div>
    </Busy>
  )
}

/** Поиск: строка поиска и группы результатов */
export function SearchSkeleton() {
  return (
    <Busy>
      <HeaderSkeleton actions={0} />
      <Skeleton className="mb-6 h-12 w-full rounded-xl" />
      <div className="grid gap-4">
        <ListCardSkeleton rows={4} />
        <ListCardSkeleton rows={3} />
      </div>
    </Busy>
  )
}
