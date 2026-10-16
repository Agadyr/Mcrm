import type { Metadata } from "next"
import { BellRingIcon, BuildingIcon, KeyRoundIcon, LogOutIcon, PaletteIcon, PhoneIcon, UserRoundPenIcon } from "lucide-react"
import { TelegramCard } from "@/components/telegram-card"
import { isTelegramConfigured } from "@/lib/telegram"
import { requireUser } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { formatDate } from "@/lib/format"
import { instantToDate } from "@/lib/dates"
import { ACTIVE_VERIFICATION_STATUSES } from "@/lib/labels"
import { PageHeader } from "@/components/page-header"
import { FormSection } from "@/components/form-section"
import { ProfileForm } from "@/components/profile-form"
import { ChangePasswordForm } from "@/components/change-password-form"
import { ThemeSwitch } from "@/components/theme-switch"
import { RoleBadge, UserAvatar } from "@/components/user-avatar"
import { Button } from "@/components/ui/button"
import { logoutEverywhereAction } from "@/server/actions/auth"

export const metadata: Metadata = { title: "Профиль" }

export default async function ProfilePage() {
  const user = await requireUser()
  const [stats, created] = await Promise.all([
    Promise.all([
      prisma.phone.count({ where: { ownerId: user.id } }),
      prisma.sale.count({ where: { cancelledAt: null, phone: { ownerId: user.id } } }),
      prisma.verification.count({ where: { OR: [{ ownerId: user.id }, { agentId: user.id }] } }),
      prisma.verification.count({ where: { agentId: user.id, status: "VERIFIED" } }),
      prisma.verification.count({ where: { agentId: user.id, status: { in: ACTIVE_VERIFICATION_STATUSES } } }),
    ]),
    prisma.user.findUnique({ where: { id: user.id }, select: { createdAt: true, telegramLinkedAt: true, telegramChatId: true, morningReminder: true } }),
  ])

  return (
    <>
      <PageHeader title="Профиль" />

      {/* Шапка профиля */}
      <section className="relative mb-4 overflow-hidden rounded-3xl border bg-card shadow-xs">
        <div className="h-24 bg-gradient-to-r from-primary via-indigo-500 to-violet-500 sm:h-28" />
        <div className="px-5 pb-5 sm:px-6">
          <UserAvatar
            name={user.name}
            login={user.login}
            className="-mt-10 size-20 text-2xl ring-4 ring-card sm:-mt-12 sm:size-24 sm:text-3xl"
          />
          <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <h2 className="truncate text-xl font-semibold sm:text-2xl">{user.name || user.login}</h2>
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                @{user.login}
                <RoleBadge role={user.role} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                user.role === "VERIFIER" ? ["В работе", stats[4]] : ["Телефонов", stats[0]],
                user.role === "VERIFIER" ? ["Верифицировано", stats[3]] : ["Продано", stats[1]],
                ["Верификаций", stats[2]],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl bg-muted/60 px-3 py-2 sm:min-w-24">
                  <div className="text-lg font-semibold tabular-nums">{value}</div>
                  <div className="text-xs text-muted-foreground">{label}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 border-t pt-4 text-sm">
            <span className="flex items-center gap-2">
              <BuildingIcon className="size-4 text-muted-foreground" />
              {user.companyName || <span className="text-muted-foreground">компания не указана</span>}
            </span>
            <span className="flex items-center gap-2">
              <PhoneIcon className="size-4 text-muted-foreground" />
              {user.phone ? (
                <a href={`tel:${user.phone}`} className="hover:text-primary">
                  {user.phone}
                </a>
              ) : (
                <span className="text-muted-foreground">телефон не указан</span>
              )}
            </span>
            {created && <span className="text-muted-foreground">В системе с {formatDate(instantToDate(created.createdAt))}</span>}
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <FormSection title="Мои данные" description="Компания, имя и номер телефона" icon={<UserRoundPenIcon />}>
          <ProfileForm
            companyOptional={user.role === "VERIFIER"}
            defaultValues={{ companyName: user.companyName ?? "", name: user.name ?? "", phone: user.phone ?? "" }}
          />
        </FormSection>
        <FormSection
          title="Пароль"
          description="После смены на других устройствах нужно будет войти заново, Telegram отвяжется"
          icon={<KeyRoundIcon />}
        >
          <ChangePasswordForm />
          {/* если телефон потерян или вход был с чужого компьютера */}
          <form action={logoutEverywhereAction} className="mt-4 border-t pt-4">
            <Button type="submit" variant="outline" className="w-full sm:w-auto">
              <LogOutIcon /> Выйти на всех устройствах
            </Button>
          </form>
        </FormSection>
        <div id="theme" className="lg:col-span-2">
          <FormSection title="Оформление" description="Тема сохраняется в этом браузере" icon={<PaletteIcon />}>
            <ThemeSwitch />
          </FormSection>
        </div>
        <div id="telegram" className="lg:col-span-2">
          <FormSection title="Уведомления в Telegram" description="Чтобы узнавать о событиях, не открывая сайт" icon={<BellRingIcon />}>
            <TelegramCard
              configured={isTelegramConfigured()}
              linkedAt={created?.telegramChatId ? (created.telegramLinkedAt ?? new Date()) : null}
              isAdmin={user.role === "ADMIN"}
              role={user.role}
              morningReminder={created?.morningReminder ?? true}
            />
          </FormSection>
        </div>
      </div>
    </>
  )
}
