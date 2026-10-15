import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { SmartphoneIcon } from "lucide-react"
import { isProfileComplete, requireUser } from "@/lib/auth"
import { ProfileForm } from "@/components/profile-form"
import { logoutAction } from "@/server/actions/auth"

export const metadata: Metadata = { title: "Добро пожаловать" }

/** Первый вход: пользователь заполняет компанию, имя и телефон */
export default async function WelcomePage() {
  const user = await requireUser()
  if (isProfileComplete(user)) redirect("/")

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[radial-gradient(ellipse_at_top,var(--color-secondary),var(--color-background)_60%)] p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/30">
            <SmartphoneIcon className="size-7" />
          </span>
          <h1 className="text-2xl font-semibold tracking-tight">Добро пожаловать!</h1>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            Расскажите немного о себе — это займёт полминуты. Данные можно изменить позже в профиле.
          </p>
        </div>
        <div className="rounded-3xl border bg-card p-6 shadow-xl shadow-primary/5 sm:p-7">
          <ProfileForm
            size="lg"
            submitLabel="Начать работу"
            companyOptional={user.role === "VERIFIER"}
            redirectTo="/"
            defaultValues={{ companyName: user.companyName ?? "", name: user.name ?? "", phone: user.phone ?? "" }}
          />
        </div>
        <form action={logoutAction} className="mt-4 text-center">
          <button type="submit" className="text-sm text-muted-foreground hover:text-foreground">
            Выйти ({user.login})
          </button>
        </form>
      </div>
    </main>
  )
}
