import { cn } from "@/lib/utils"

/** Блок формы: белая карточка с заголовком и подсказкой */
export function FormSection({
  title,
  description,
  icon,
  actions,
  className,
  children,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  icon?: React.ReactNode
  actions?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border bg-card p-4 shadow-xs sm:p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {icon && (
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary [&_svg]:size-[18px]">
              {icon}
            </span>
          )}
          <div>
            <h2 className="font-semibold">{title}</h2>
            {description && <p className="text-sm text-muted-foreground">{description}</p>}
          </div>
        </div>
        {actions}
      </div>
      <div className={cn("grid gap-4", className)}>{children}</div>
    </section>
  )
}

/** Кнопки сохранения: на телефоне прилипают к низу экрана над панелью вкладок */
export function FormActions({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-20 -mx-1 flex gap-2 rounded-2xl border bg-card/95 p-2 shadow-lg backdrop-blur-md lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none lg:backdrop-blur-none [&>*]:flex-1 lg:[&>*]:flex-none">
      {children}
    </div>
  )
}
