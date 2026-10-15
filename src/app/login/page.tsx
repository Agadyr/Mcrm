import type { Metadata } from "next"
import { Suspense } from "react"
import Link from "next/link"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/auth"
import { SmartphoneIcon } from "lucide-react"
import { LoginForm } from "./login-form"

export const metadata: Metadata = { title: "Вход" }

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/")
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[radial-gradient(ellipse_at_top,var(--color-secondary),var(--color-background)_60%)] p-4">
      <div className="w-full max-w-sm rounded-3xl border bg-card p-7 shadow-xl shadow-primary/5">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <div className="mb-1 flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/30">
            <SmartphoneIcon className="size-5" />
          </div>
          <h1 className="text-xl font-semibold">Учёт телефонов</h1>
          <p className="text-sm text-muted-foreground">Войдите, чтобы продолжить</p>
        </div>
        <Suspense>
          <LoginForm />
        </Suspense>
        <div className="mt-6 border-t pt-5 text-center text-sm text-muted-foreground">
          Вы верификатор?{" "}
          <Link href="/register" className="font-medium text-primary hover:underline">
            Зарегистрироваться
          </Link>
        </div>
      </div>
    </main>
  )
}
