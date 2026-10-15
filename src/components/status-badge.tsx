import type { PhoneStatus, VerificationStatus } from "@prisma/client"
import { BadgeCheckIcon } from "lucide-react"
import {
  PHONE_STATUS_COLOR,
  PHONE_STATUS_DOT,
  PHONE_STATUS_LABEL,
  VERIFICATION_STATUS_COLOR,
  VERIFICATION_STATUS_DOT,
  VERIFICATION_STATUS_LABEL,
} from "@/lib/labels"
import { cn } from "@/lib/utils"

const base =
  "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset ring-current/10"

function Dot({ className }: { className: string }) {
  return <span className={cn("size-1.5 rounded-full", className)} />
}

export function PhoneStatusBadge({ status, className }: { status: PhoneStatus; className?: string }) {
  return (
    <span className={cn(base, PHONE_STATUS_COLOR[status], className)}>
      <Dot className={PHONE_STATUS_DOT[status]} />
      {PHONE_STATUS_LABEL[status]}
    </span>
  )
}

export function VerificationStatusBadge({
  status,
  className,
  prefix,
  title,
}: {
  status: VerificationStatus
  className?: string
  prefix?: string
  title?: string
}) {
  return (
    <span title={title} className={cn(base, VERIFICATION_STATUS_COLOR[status], className)}>
      <Dot className={VERIFICATION_STATUS_DOT[status]} />
      {prefix}
      {VERIFICATION_STATUS_LABEL[status]}
    </span>
  )
}

/** Значок «верифицирован» у товара */
export function VerifiedMark({ className }: { className?: string }) {
  return (
    <span title="Верифицирован" className={cn(base, "bg-emerald-50 px-2 text-emerald-700", className)}>
      <BadgeCheckIcon className="size-3.5" />
      Верифицирован
    </span>
  )
}

/**
 * Статус верификации в списке: компактная плашка по размеру текста — точка, название и (если статус можно менять) стрелка.
 */
export const STATUS_PILL =
  "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold whitespace-nowrap ring-1 ring-current/15 ring-inset"

export function VerificationStatusPill({ status, className, title }: { status: VerificationStatus; className?: string; title?: string }) {
  return (
    <span title={title} className={cn(STATUS_PILL, VERIFICATION_STATUS_COLOR[status], className)}>
      <Dot className={VERIFICATION_STATUS_DOT[status]} />
      {VERIFICATION_STATUS_LABEL[status]}
    </span>
  )
}
