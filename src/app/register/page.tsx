import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/auth"
import { RegisterForm } from "./register-form"

export const metadata: Metadata = { title: "Регистрация верификатора" }

export default async function RegisterPage() {
  if (await getCurrentUser()) redirect("/")
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[radial-gradient(ellipse_at_top,var(--color-secondary),var(--color-background)_60%)] p-4">
      <RegisterForm />
    </main>
  )
}
