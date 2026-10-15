import { InboxIcon } from "lucide-react"

export function PageHeader({
  title,
  description,
  actions,
  back,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  back?: React.ReactNode
}) {
  return (
    <div className="mb-5 flex flex-col gap-4 sm:mb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {back && <div className="mb-2 text-sm">{back}</div>}
        <h1 className="text-2xl font-semibold tracking-tight sm:text-[1.75rem]">{title}</h1>
        {description && <div className="mt-1.5 text-sm text-muted-foreground">{description}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function EmptyState({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed bg-card/60 px-6 py-12 text-center text-sm text-muted-foreground">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        {icon ?? <InboxIcon className="size-6" />}
      </span>
      <div className="max-w-sm">{children}</div>
    </div>
  )
}
