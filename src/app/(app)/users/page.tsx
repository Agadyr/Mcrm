import type { Metadata } from "next"
import { BuildingIcon, ClockIcon, PhoneIcon } from "lucide-react"
import { requireAdmin } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { formatDate, formatDateTime } from "@/lib/format"
import { instantToDate } from "@/lib/dates"
import { PageHeader } from "@/components/page-header"
import { RoleBadge, UserAvatar } from "@/components/user-avatar"
import { cn } from "@/lib/utils"
import { CreateUserButton, PendingActions, UserActions } from "./user-dialogs"

export const metadata: Metadata = { title: "Пользователи" }

export default async function UsersPage() {
  const admin = await requireAdmin()
  const [allUsers, phoneCounts] = await Promise.all([
    prisma.user.findMany({ orderBy: [{ role: "asc" }, { createdAt: "asc" }] }),
    prisma.phone.groupBy({ by: ["ownerId"], _count: true }),
  ])
  const requests = allUsers.filter((u) => u.pendingApproval)
  const users = allUsers.filter((u) => !u.pendingApproval)
  const phonesOf = (id: string) => phoneCounts.find((c) => c.ownerId === id)?._count ?? 0
  const active = users.filter((u) => u.isActive).length

  return (
    <>
      <PageHeader
        title="Пользователи"
        description={`Всего ${users.length} · активных ${active}. У каждого свои товары и верификации.`}
        actions={<CreateUserButton />}
      />
      {requests.length > 0 && (
        <section className="mb-6 rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
          <h2 className="mb-1 flex items-center gap-2 font-semibold">
            <ClockIcon className="size-4 text-amber-700" /> Заявки верификаторов
            <span className="rounded-full bg-amber-500 px-2 text-xs text-white">{requests.length}</span>
          </h2>
          <p className="mb-3 text-sm text-muted-foreground">
            Зарегистрировались сами. Пока вы не одобрите, они не могут войти и не видны компаниям.
          </p>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {requests.map((u) => (
              <div key={u.id} className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-xs">
                <div className="flex items-start gap-3">
                  <UserAvatar name={u.name} login={u.login} className="size-11" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{u.name}</div>
                    <div className="text-sm text-muted-foreground">@{u.login}</div>
                  </div>
                </div>
                <div className="flex flex-col gap-1 text-sm">
                  <span className="flex items-center gap-2">
                    <PhoneIcon className="size-4 text-muted-foreground" />
                    {u.phone ? <a href={`tel:${u.phone}`} className="hover:text-primary">{u.phone}</a> : "—"}
                  </span>
                  <span className="text-xs text-muted-foreground">Заявка от {formatDateTime(u.createdAt)}</span>
                </div>
                <PendingActions id={u.id} name={u.name || u.login} />
              </div>
            ))}
          </div>
        </section>
      )}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {users.map((u) => (
          <div
            key={u.id}
            className={cn("flex flex-col rounded-2xl border bg-card p-4 shadow-xs", !u.isActive && "opacity-60")}
          >
            <div className="flex items-start gap-3">
              <UserAvatar name={u.name} login={u.login} className="size-11" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{u.name || <span className="text-muted-foreground">Профиль не заполнен</span>}</div>
                <div className="text-sm text-muted-foreground">@{u.login}</div>
              </div>
              <UserActions user={{ id: u.id, login: u.login, isActive: u.isActive }} isSelf={u.id === admin.id} />
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <RoleBadge role={u.role} />
              <span
                className={cn(
                  "inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium",
                  u.isActive ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                )}
              >
                <span className={cn("size-1.5 rounded-full", u.isActive ? "bg-emerald-500" : "bg-rose-500")} />
                {u.isActive ? "Активен" : "Заблокирован"}
              </span>
              {u.id === admin.id && (
                <span className="inline-flex h-6 items-center rounded-full bg-muted px-2.5 text-xs font-medium">Это вы</span>
              )}
            </div>
            <div className="mt-3 flex flex-col gap-1.5 text-sm">
              <span className="flex items-center gap-2">
                <BuildingIcon className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{u.companyName || <span className="text-muted-foreground">—</span>}</span>
              </span>
              <span className="flex items-center gap-2">
                <PhoneIcon className="size-4 shrink-0 text-muted-foreground" />
                {u.phone ? <a href={`tel:${u.phone}`} className="hover:text-primary">{u.phone}</a> : <span className="text-muted-foreground">—</span>}
              </span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 border-t pt-3 text-xs text-muted-foreground">
              <div>
                Телефонов
                <div className="text-sm font-semibold text-foreground tabular-nums">{phonesOf(u.id)}</div>
              </div>
              <div>
                {u.lastLoginAt ? "Последний вход" : "Создан"}
                <div className="text-sm font-medium text-foreground">
                  {u.lastLoginAt ? formatDateTime(u.lastLoginAt) : formatDate(instantToDate(u.createdAt))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
