"use client"

import { useState, useTransition } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { FormField } from "@/components/form-field"
import { loginAction } from "@/server/actions/auth"
import { useHydrated } from "@/lib/use-hydrated"

export function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const hydrated = useHydrated()

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setError(null)
    startTransition(async () => {
      const result = await loginAction({ login: form.get("login"), password: form.get("password") })
      if (!result.ok) {
        setError(result.error)
        return
      }
      const next = searchParams.get("next")
      router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/")
      router.refresh()
    })
  }

  return (
    <form method="post" onSubmit={onSubmit} className="flex flex-col gap-4">
      <FormField label="Логин" htmlFor="login">
        <Input id="login" name="login" autoComplete="username" autoCapitalize="none" required autoFocus />
      </FormField>
      <FormField label="Пароль" htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </FormField>
      {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      <Button type="submit" size="lg" disabled={pending || !hydrated}>
        {pending ? "Вход…" : "Войти"}
      </Button>
    </form>
  )
}
