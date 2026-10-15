"use client"

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import type { z } from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { FormField } from "@/components/form-field"
import { changePasswordSchema } from "@/lib/validators/auth"
import { changePasswordAction } from "@/server/actions/auth"
import { useHydrated } from "@/lib/use-hydrated"

type Values = z.input<typeof changePasswordSchema>

export function ChangePasswordForm() {
  const form = useForm<Values>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  })
  const { errors, isSubmitting } = form.formState
  const hydrated = useHydrated()

  async function onSubmit(values: Values) {
    const result = await changePasswordAction(values)
    if (!result.ok) {
      for (const [k, v] of Object.entries(result.fieldErrors ?? {})) form.setError(k as keyof Values, { message: v })
      toast.error(result.error)
      return
    }
    form.reset()
    toast.success("Пароль изменён. На других устройствах нужно войти заново.")
  }

  return (
    <form method="post" onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <FormField label="Текущий пароль" htmlFor="currentPassword" error={errors.currentPassword?.message}>
        <Input id="currentPassword" type="password" autoComplete="current-password" {...form.register("currentPassword")} />
      </FormField>
      <FormField label="Новый пароль" htmlFor="newPassword" error={errors.newPassword?.message}>
        <Input id="newPassword" type="password" autoComplete="new-password" {...form.register("newPassword")} />
      </FormField>
      <FormField label="Повторите новый пароль" htmlFor="confirmPassword" error={errors.confirmPassword?.message}>
        <Input id="confirmPassword" type="password" autoComplete="new-password" {...form.register("confirmPassword")} />
      </FormField>
      <Button type="submit" disabled={isSubmitting || !hydrated} className="self-start">
        {isSubmitting ? "Сохранение…" : "Сменить пароль"}
      </Button>
    </form>
  )
}
