import { BriefcaseIcon, ShieldIcon } from "lucide-react"
import type { UserRole } from "@prisma/client"
import { cn } from "@/lib/utils"

const GRADIENTS = [
  "from-indigo-500 to-violet-500",
  "from-sky-500 to-indigo-500",
  "from-emerald-500 to-teal-500",
  "from-amber-500 to-orange-500",
  "from-rose-500 to-pink-500",
  "from-fuchsia-500 to-purple-500",
]

export function initials(name: string | null | undefined, fallback: string) {
  const parts = (name || fallback).trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?"
}

/** Кружок с инициалами; цвет стабилен для одного логина */
export function UserAvatar({
  name,
  login,
  className,
}: {
  name: string | null | undefined
  login: string
  className?: string
}) {
  const hash = [...login].reduce((a, c) => a + c.charCodeAt(0), 0)
  return (
    <span
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-sm font-semibold text-white shadow-sm",
        GRADIENTS[hash % GRADIENTS.length],
        className
      )}
    >
      {initials(name, login)}
    </span>
  )
}

export const ROLE_LABEL: Record<UserRole, string> = {
  ADMIN: "Администратор",
  USER: "Компания",
  VERIFIER: "Верификатор",
}

/** Значок роли (у обычной компании не показываем) */
export function RoleBadge({ role }: { role: UserRole }) {
  if (role === "USER") return null
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-xs font-medium",
        role === "ADMIN" ? "bg-secondary text-secondary-foreground" : "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
      )}
    >
      {role === "ADMIN" ? <ShieldIcon className="size-3" /> : <BriefcaseIcon className="size-3" />}
      {ROLE_LABEL[role]}
    </span>
  )
}
