"use client"

import { useState } from "react"
import Link from "next/link"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { BriefcaseIcon, ClockIcon, KeyRoundIcon, PhoneIcon, UserIcon } from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { FormField } from "@/components/form-field"
import { verifierSignupSchema, type VerifierSignupInput } from "@/lib/validators/user"
import { registerVerifierAction } from "@/server/actions/auth"
import { useHydrated } from "@/lib/use-hydrated"

function IconInput({ icon, ...props }: React.ComponentProps<typeof Input> & { icon: React.ReactNode }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground [&_svg]:size-4">
        {icon}
      </span>
      <Input {...props} className="pl-9" />
    </div>
  )
}

export function RegisterForm() {
  const [sent, setSent] = useState(false)
  const form = useForm<VerifierSignupInput>({
    resolver: zodResolver(verifierSignupSchema),
    defaultValues: { name: "", phone: "", login: "", password: "", confirmPassword: "", website: "" },
  })
  const { errors, isSubmitting } = form.formState
  const hydrated = useHydrated()

  async function onSubmit(values: VerifierSignupInput) {
    const r = await registerVerifierAction(values)
    if (!r.ok) {
      for (const [k, v] of Object.entries(r.fieldErrors ?? {})) form.setError(k as keyof VerifierSignupInput, { message: v })
      toast.error(r.error)
      return
    }
    setSent(true)
  }

  if (sent) {
    return (
      <div className="w-full max-w-md rounded-3xl border bg-card p-7 text-center shadow-xl shadow-primary/5">
        <span className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-700">
          <ClockIcon className="size-7" />
        </span>
        <h1 className="text-xl font-semibold">Заявка отправлена</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Администратор проверит её и одобрит. После этого войдите со своим логином{" "}
          <b className="text-foreground">{form.getValues("login").toLowerCase()}</b> и паролем.
        </p>
        <Link href="/login" className={buttonVariants({ size: "lg", className: "mt-6 w-full" })}>
          На страницу входа
        </Link>
      </div>
    )
  }

  return (
    <div className="w-full max-w-md">
      <div className="mb-6 flex flex-col items-center text-center">
        <span className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/30">
          <BriefcaseIcon className="size-7" />
        </span>
        <h1 className="text-2xl font-semibold tracking-tight">Регистрация верификатора</h1>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          Компании смогут передавать вам телефоны на верификацию. Доступ откроется после одобрения администратором.
        </p>
      </div>
      <form
        method="post"
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-4 rounded-3xl border bg-card p-6 shadow-xl shadow-primary/5 sm:p-7"
      >
        <FormField label="Имя и фамилия" htmlFor="name" required error={errors.name?.message}>
          <IconInput id="name" icon={<UserIcon />} autoComplete="name" autoFocus {...form.register("name")} />
        </FormField>
        <FormField label="Номер телефона" htmlFor="phone" required error={errors.phone?.message}>
          <IconInput id="phone" icon={<PhoneIcon />} type="tel" inputMode="tel" autoComplete="tel" placeholder="+7 7__ ___ __ __" {...form.register("phone")} />
        </FormField>
        <div className="my-1 border-t" />
        <FormField label="Логин" htmlFor="login" required error={errors.login?.message} hint="Латиница и цифры, например erlan">
          <IconInput id="login" icon={<UserIcon />} autoCapitalize="none" autoComplete="username" {...form.register("login")} />
        </FormField>
        <FormField label="Пароль" htmlFor="password" required error={errors.password?.message}>
          <IconInput id="password" icon={<KeyRoundIcon />} type="password" autoComplete="new-password" {...form.register("password")} />
        </FormField>
        <FormField label="Повторите пароль" htmlFor="confirmPassword" required error={errors.confirmPassword?.message}>
          <IconInput id="confirmPassword" icon={<KeyRoundIcon />} type="password" autoComplete="new-password" {...form.register("confirmPassword")} />
        </FormField>
        {/* ловушка для ботов */}
        <input type="text" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" {...form.register("website")} />
        <Button type="submit" size="lg" disabled={isSubmitting || !hydrated} className="mt-2 w-full">
          {isSubmitting ? "Отправка…" : "Отправить заявку"}
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-muted-foreground">
        Уже есть аккаунт?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Войти
        </Link>
      </p>
    </div>
  )
}
