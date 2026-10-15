import { redirect } from "next/navigation"
import { prisma } from "@/lib/db"
import { isProfileComplete, requireUser } from "@/lib/auth"
import { MobileHeader, MobileTabBar, Sidebar, type NavUser } from "@/components/app-nav"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  // первый вход: сначала заполнить компанию, имя и телефон
  if (!isProfileComplete(user)) redirect("/welcome")

  const [pendingCount, kaspiShop, kaspiNew] = await Promise.all([
    user.role === "ADMIN" ? prisma.user.count({ where: { pendingApproval: true } }) : 0,
    user.role === "VERIFIER" ? null : prisma.kaspiShop.findUnique({ where: { ownerId: user.id }, select: { status: true } }),
    user.role === "VERIFIER" ? 0 : prisma.kaspiOrder.count({ where: { ownerId: user.id, state: "NEW", status: "APPROVED_BY_BANK" } }),
  ])
  const navUser: NavUser = {
    login: user.login,
    name: user.name,
    companyName: user.companyName,
    isAdmin: user.role === "ADMIN",
    isVerifier: user.role === "VERIFIER",
    pendingCount,
    kaspiNew,
    kaspi: kaspiShop ? (kaspiShop.status === "ACTIVE" ? "active" : "invalid") : "none",
  }
  return (
    <div className="flex min-h-dvh">
      <Sidebar user={navUser} />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileHeader user={navUser} />
        {/* снизу отступ под панель вкладок на телефоне */}
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 pt-5 pb-28 sm:px-6 lg:px-8 lg:pt-8 lg:pb-12">
          {children}
        </main>
        <MobileTabBar user={navUser} />
      </div>
    </div>
  )
}
