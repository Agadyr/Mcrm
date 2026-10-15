"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import {
  BanknoteIcon,
  ChartNoAxesCombinedIcon,
  FileSpreadsheetIcon,
  HandCoinsIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  PlusIcon,
  SearchIcon,
  SearchCheckIcon,
  ExternalLinkIcon,
  ShieldCheckIcon,
  SmartphoneIcon,
  UserCogIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { logoutAction } from "@/server/actions/auth"
import { RFS_URL } from "@/lib/labels"
import { cn } from "@/lib/utils"
import { KaspiMark } from "@/components/kaspi-mark"
import { UserAvatar } from "@/components/user-avatar"
import { SearchBox } from "@/components/search-box"

export type NavUser = {
  login: string
  name: string | null
  companyName: string | null
  isAdmin: boolean
  isVerifier: boolean
  /** заявки верификаторов, ждущие одобрения (для администратора) */
  pendingCount?: number
  /** Kaspi магазин: не подключён, работает или токен перестал работать */
  kaspi?: "none" | "active" | "invalid"
  /** новые заказы Kaspi, которые ждут принятия */
  kaspiNew?: number
}

type NavItem = { href: string; label: string; short?: string; icon: LucideIcon }

const MAIN: NavItem[] = [
  { href: "/", label: "Главная", icon: LayoutDashboardIcon },
  { href: "/phones", label: "Товары", icon: SmartphoneIcon },
  { href: "/sales", label: "Продажи", icon: BanknoteIcon },
  { href: "/verifications", label: "Верификация телефонов", short: "Верификация", icon: ShieldCheckIcon },
  { href: "/verifiers", label: "Верификаторы", icon: UsersIcon },
  { href: "/analytics", label: "Аналитика", icon: ChartNoAxesCombinedIcon },
]
const EXTRA: NavItem[] = [
  { href: "/phones/import", label: "Импорт из Excel", icon: FileSpreadsheetIcon },
]
const ADMIN: NavItem = { href: "/users", label: "Пользователи", icon: UserCogIcon }

function extraItems(user: NavUser) {
  if (user.isVerifier) return []
  return user.isAdmin ? [...EXTRA, ADMIN] : EXTRA
}

/** Пункты меню верификатора: он не ведёт склад — только верификации и свои люди */
const VERIFIER_MAIN: NavItem[] = [
  { href: "/", label: "Главная", icon: LayoutDashboardIcon },
  { href: "/verifications", label: "Верификации", icon: ShieldCheckIcon },
  { href: "/verifiers", label: "Мои люди", short: "Люди", icon: UsersIcon },
]

function mainItems(user: NavUser) {
  return user.isVerifier ? VERIFIER_MAIN : MAIN
}

/** Справа от «+» на телефоне: у компании — Продажи и Верификация, у верификатора — Люди */
function tabBarRight(user: NavUser) {
  const main = mainItems(user)
  return user.isVerifier ? main.slice(2, 3) : main.slice(2, 4)
}

/** Что не поместилось в нижнюю панель — открывается из профиля в верхней полосе */
function profileMenuItems(user: NavUser) {
  return [...mainItems(user).slice(2 + tabBarRight(user).length), ...extraItems(user)]
}

const VERIFIER_QUICK_ACTIONS = [
  { href: "/verifications/new", label: "Телефон на верификацию", hint: "Клиента, которого нет в системе", icon: ShieldCheckIcon },
  { href: "/verifiers", label: "Мои люди", hint: "Кто был за границей", icon: UsersIcon },
]

const QUICK_ACTIONS = [
  { href: "/phones/new", label: "Добавить телефон", hint: "Новое поступление на склад", icon: SmartphoneIcon },
  { href: "/verifications/new", label: "Отдать на верификацию", hint: "Передать IMEI человеку", icon: ShieldCheckIcon },
  { href: "/sales?state=debt", label: "Принять оплату долга", hint: "Покупатель вернул деньги", icon: HandCoinsIcon },
  { href: "/phones/import", label: "Импорт из Excel", hint: "Перенести старую таблицу", icon: FileSpreadsheetIcon },
]

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/"
  if (href === "/phones") return pathname.startsWith("/phones") && !pathname.startsWith("/phones/import")
  return pathname.startsWith(href)
}

function Logo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm shadow-primary/30",
        className
      )}
    >
      <SmartphoneIcon className="size-5" />
    </span>
  )
}

function LogoutButton({ className }: { className?: string }) {
  return (
    <form action={logoutAction}>
      <button
        type="submit"
        className={cn(
          "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
          className
        )}
      >
        <LogOutIcon className="size-[18px]" /> Выйти
      </button>
    </form>
  )
}

function NavLink({ item, onNavigate, badge }: { item: NavItem; onNavigate?: () => void; badge?: number }) {
  const pathname = usePathname()
  const active = isActive(pathname, item.href)
  const Icon = item.icon
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
        active ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      <Icon className={cn("size-[18px] shrink-0", active && "text-primary")} />
      {item.label}
      {!!badge && (
        <span className="ml-auto min-w-5 rounded-full bg-amber-500 px-1.5 text-center text-xs font-semibold text-white">{badge}</span>
      )}
    </Link>
  )
}

/** Ярлык на сайт проверки IMEI (РФС) — открывается в новой вкладке */
function RfsLink({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <a
      href={RFS_URL}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onNavigate}
      className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <SearchCheckIcon className="size-[18px] shrink-0" />
      Проверка IMEI в РФС
      <ExternalLinkIcon className="ml-auto size-3.5 opacity-60" />
    </a>
  )
}

/** Kaspi магазин в меню: пока не подключён — приглашение с кнопкой, потом — пункт со статусом */
function KaspiNav({ user, onNavigate }: { user: NavUser; onNavigate?: () => void }) {
  const active = usePathname().startsWith("/kaspi")
  if (user.isVerifier || !user.kaspi) return null
  if (user.kaspi === "none") {
    return (
      <Link
        href="/kaspi"
        onClick={onNavigate}
        className="mx-1 mt-2 block rounded-2xl border bg-card p-3.5 transition-colors hover:bg-muted/50"
      >
        <div className="flex items-center gap-3">
          <KaspiMark className="size-9" />
          <div className="min-w-0 leading-tight">
            <div className="text-sm font-semibold">Kaspi магазин</div>
            <div className="text-xs text-muted-foreground">Подключите за 2 минуты</div>
          </div>
        </div>
        <div className="mt-3 flex h-8 items-center justify-center rounded-lg bg-secondary text-xs font-semibold text-secondary-foreground">Подключить</div>
      </Link>
    )
  }
  return (
    <Link
      href="/kaspi"
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
        active ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      <KaspiMark className="size-6" />
      Kaspi магазин
      {user.kaspi === "active" && !!user.kaspiNew ? (
        <span className="ml-auto min-w-5 rounded-full bg-rose-100 px-1.5 text-center text-xs font-semibold text-rose-700 tabular-nums dark:bg-rose-950 dark:text-rose-300" title="Новые заказы">
          {user.kaspiNew}
        </span>
      ) : (
        <span
          title={user.kaspi === "active" ? "Подключён" : "Токен не работает"}
          className={cn("ml-auto size-2 rounded-full", user.kaspi === "active" ? "bg-emerald-500" : "bg-rose-500")}
        />
      )}
    </Link>
  )
}

/** Боковое меню — компьютер и планшет */
/** Карточка текущего пользователя со ссылкой на профиль */
function UserCard({ user, onNavigate }: { user: NavUser; onNavigate?: () => void }) {
  const active = usePathname() === "/profile"
  return (
    <Link
      href="/profile"
      onClick={onNavigate}
      className={cn("flex items-center gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-muted", active && "bg-secondary")}
    >
      <UserAvatar name={user.name} login={user.login} />
      <div className="min-w-0 leading-tight">
        <div className="truncate text-sm font-semibold">{user.name || user.login}</div>
        <div className="truncate text-xs text-muted-foreground">{user.companyName || `@${user.login}`}</div>
      </div>
    </Link>
  )
}

export function Sidebar({ user }: { user: NavUser }) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r bg-card lg:flex">
      <Link href="/" className="flex items-center gap-3 px-5 py-5">
        <Logo />
        <div className="min-w-0 leading-tight">
          <div className="truncate font-semibold">{user.companyName || "Учёт телефонов"}</div>
          <div className="text-xs text-muted-foreground">{user.isVerifier ? "верификатор" : "учёт телефонов"}</div>
        </div>
      </Link>
      <SearchBox className="mx-3 mb-3" />
      <nav className="flex flex-1 flex-col gap-1 px-3">
        {mainItems(user).map((item) => (
          <NavLink key={item.href} item={item} />
        ))}
        <div className="mx-3 my-3 border-t" />
        <RfsLink />
        {extraItems(user).map((item) => (
          <NavLink key={item.href} item={item} badge={item.href === "/users" ? user.pendingCount : undefined} />
        ))}
        <div className="mt-auto pb-3">
          <KaspiNav user={user} />
        </div>
      </nav>
      <div className="border-t p-3">
        <UserCard user={user} />
        <LogoutButton />
      </div>
    </aside>
  )
}

/** Верхняя полоса на телефоне. Аватар открывает меню: остальные разделы, профиль и выход. */
export function MobileHeader({ user }: { user: NavUser }) {
  const [menuOpen, setMenuOpen] = useState(false)
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b bg-background/85 px-4 backdrop-blur-md lg:hidden">
      <Link href="/" className="flex min-w-0 items-center gap-2.5 font-semibold">
        <Logo className="size-8 rounded-lg [&_svg]:size-4" />
        <span className="truncate">{user.companyName || "Учёт телефонов"}</span>
      </Link>
      <div className="flex items-center gap-1">
        <Link href="/search" aria-label="Поиск" className="flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted">
          <SearchIcon className="size-5" />
        </Link>
        <button type="button" onClick={() => setMenuOpen(true)} className="relative rounded-full">
          <UserAvatar name={user.name} login={user.login} className="size-8 text-xs" />
          <span className="sr-only">Меню профиля</span>
          {!!user.pendingCount && <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-amber-500 ring-2 ring-background" />}
        </button>
      </div>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="top" className="rounded-b-3xl pt-[env(safe-area-inset-top)]">
          <div className="p-4">
            <SheetTitle className="sr-only">Меню профиля</SheetTitle>
            <div className="flex flex-col gap-1">
              <UserCard user={user} onNavigate={() => setMenuOpen(false)} />
              <div className="my-2 border-t" />
              <RfsLink onNavigate={() => setMenuOpen(false)} />
              {profileMenuItems(user).map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  onNavigate={() => setMenuOpen(false)}
                  badge={item.href === "/users" ? user.pendingCount : undefined}
                />
              ))}
              <KaspiNav user={user} onNavigate={() => setMenuOpen(false)} />
              <div className="my-2 border-t" />
              <LogoutButton />
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </header>
  )
}

/** Нижняя панель вкладок на телефоне */
export function MobileTabBar({ user }: { user: NavUser }) {
  const pathname = usePathname()
  const [addOpen, setAddOpen] = useState(false)
  const main = mainItems(user)

  const tab = (item: NavItem) => {
    const active = isActive(pathname, item.href)
    const Icon = item.icon
    return (
      <Link
        key={item.href}
        href={item.href}
        className={cn(
          "flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[10.5px] font-medium tracking-tight",
          active ? "text-primary" : "text-muted-foreground"
        )}
      >
        <Icon className="size-[22px]" strokeWidth={active ? 2.2 : 1.8} />
        {item.short ?? item.label}
      </Link>
    )
  }

  return (
    <>
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 backdrop-blur-md lg:hidden">
        <div className="flex h-16 items-stretch">
          {tab(main[0])}
          {tab(main[1])}
          <div className="flex flex-1 items-center justify-center">
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              aria-label="Добавить"
              className="flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition-transform active:scale-95"
            >
              <PlusIcon className="size-6" />
            </button>
          </div>
          {tabBarRight(user).map(tab)}
        </div>
      </nav>

      <Sheet open={addOpen} onOpenChange={setAddOpen}>
        <SheetContent side="bottom" className="pb-safe rounded-t-3xl">
          <div className="p-4 pb-6">
            <SheetTitle className="mb-3 text-lg">Что сделать?</SheetTitle>
            <div className="flex flex-col gap-2">
              {(user.isVerifier ? VERIFIER_QUICK_ACTIONS : QUICK_ACTIONS).map(({ href, label, hint, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setAddOpen(false)}
                  className="flex items-center gap-3 rounded-2xl border bg-card p-3 transition-colors active:bg-muted"
                >
                  <span className="flex size-11 items-center justify-center rounded-xl bg-secondary text-primary">
                    <Icon className="size-5" />
                  </span>
                  <span>
                    <span className="block font-medium">{label}</span>
                    <span className="block text-xs text-muted-foreground">{hint}</span>
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </SheetContent>
      </Sheet>

    </>
  )
}
