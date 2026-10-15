import { TriangleAlertIcon } from "lucide-react"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

export function FormField({
  label,
  htmlFor,
  error,
  warning,
  hint,
  required,
  className,
  children,
}: {
  label?: React.ReactNode
  htmlFor?: string
  error?: string
  warning?: React.ReactNode
  hint?: React.ReactNode
  required?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label && (
        <Label htmlFor={htmlFor}>
          {label}
          {required && <span className="text-destructive">*</span>}
        </Label>
      )}
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : warning ? (
        <div className="flex items-start gap-1 text-xs text-amber-700 dark:text-amber-400">
          <TriangleAlertIcon className="mt-px size-3.5 shrink-0" />
          <div>{warning}</div>
        </div>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}
