"use client"

import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { BuildingIcon, PhoneIcon, UserIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { FormField } from "@/components/form-field"
import { profileSchema, type ProfileInput } from "@/lib/validators/user"
import { updateProfileAction } from "@/server/actions/profile"
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

/** Компания, имя, телефон — используется на приветственном экране и в профиле */
export function ProfileForm({
  defaultValues,
  submitLabel = "Сохранить",
  redirectTo,
  size = "default",
  companyOptional,
}: {
  /** у верификатора компания по желанию */
  companyOptional?: boolean
  defaultValues: ProfileInput
  submitLabel?: string
  redirectTo?: string
  size?: "default" | "lg"
}) {
  const router = useRouter()
  const form = useForm<ProfileInput>({ resolver: zodResolver(profileSchema), defaultValues })
  // начальные значения сразу в разметке — поля не пустые и до загрузки скриптов
  const reg = (name: Parameters<typeof form.register>[0]) => ({
    ...form.register(name),
    defaultValue: String((defaultValues as Record<string, unknown>)[name] ?? ""),
  })
  const { errors, isSubmitting, isDirty } = form.formState
  const hydrated = useHydrated()

  async function onSubmit(values: ProfileInput) {
    const r = await updateProfileAction(values)
    if (!r.ok) {
      for (const [k, v] of Object.entries(r.fieldErrors ?? {})) form.setError(k as keyof ProfileInput, { message: v })
      toast.error(r.error)
      return
    }
    toast.success("Профиль сохранён")
    form.reset(values)
    if (redirectTo) router.replace(redirectTo)
    router.refresh()
  }

  return (
    <form method="post" onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <FormField
        label={companyOptional ? "Название (необязательно)" : "Название компании"}
        htmlFor="companyName"
        required={!companyOptional}
        error={errors.companyName?.message}
      >
        <IconInput id="companyName" icon={<BuildingIcon />} placeholder="Например, iStore Алматы" {...reg("companyName")} />
      </FormField>
      <FormField label="Ваше имя" htmlFor="name" required error={errors.name?.message}>
        <IconInput id="name" icon={<UserIcon />} placeholder="Имя и фамилия" autoComplete="name" {...reg("name")} />
      </FormField>
      <FormField label="Номер телефона" htmlFor="phone" required error={errors.phone?.message}>
        <IconInput
          id="phone"
          icon={<PhoneIcon />}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="+7 7__ ___ __ __"
          {...reg("phone")}
        />
      </FormField>
      <Button type="submit" size={size === "lg" ? "lg" : "default"} disabled={isSubmitting || !hydrated || (!redirectTo && !isDirty)} className={size === "lg" ? "mt-2 w-full" : "self-start"}>
        {isSubmitting ? "Сохранение…" : submitLabel}
      </Button>
    </form>
  )
}
