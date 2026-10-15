"use client"

import { useRouter } from "next/navigation"
import { Controller, useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { BuildingIcon, ShieldCheckIcon, UserIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Combobox } from "@/components/combobox"
import { CountrySelect } from "@/components/country-select"
import { CopyText } from "@/components/copy-text"
import { FormField } from "@/components/form-field"
import { FormActions, FormSection } from "@/components/form-section"
import { MoneyInput } from "@/components/money-input"
import { NativeSelect } from "@/components/native-select"
import { formatDate, formatMoney } from "@/lib/format"
import { VERIFICATION_STATUS_LABEL, VERIFICATION_STATUSES } from "@/lib/labels"
import { cn } from "@/lib/utils"
import { agentWorkSchema, type AgentWorkData, type AgentWorkInput } from "@/lib/validators/verification"
import { updateAgentWorkAction } from "@/server/actions/verifications"
import type { VerifierOption } from "./verification-form"

export type AgentJob = {
  companyName: string
  phoneModel: string
  imei1: string
  imei2: string | null
  serialNumber: string | null
  handedAt: Date
  agentFee: number
  agentPaid: boolean
  note: string | null // заметка компании
}

/** Верификатор ведёт телефон, который ему передала компания */
export function AgentWorkForm({
  verificationId,
  job,
  defaultValues,
  verifiers,
}: {
  verificationId: string
  job: AgentJob
  defaultValues: AgentWorkInput
  verifiers: VerifierOption[]
}) {
  const router = useRouter()
  const form = useForm<AgentWorkInput, unknown, AgentWorkData>({ resolver: zodResolver(agentWorkSchema), defaultValues })
  // начальные значения сразу в разметке — поля не пустые и до загрузки скриптов
  const reg = (name: Parameters<typeof form.register>[0]) => ({
    ...form.register(name),
    defaultValue: String((defaultValues as Record<string, unknown>)[name] ?? ""),
  })
  const { errors, isSubmitting } = form.formState
  const [mode, payment] = useWatch({ control: form.control, name: ["verifierMode", "payment"] })
  const paymentNum = Number(String(payment ?? "").replace(/\D/g, "")) || 0
  const profit = job.agentFee - paymentNum

  async function onSubmit() {
    const r = await updateAgentWorkAction(verificationId, form.getValues())
    if (!r.ok) {
      for (const [k, v] of Object.entries(r.fieldErrors ?? {})) form.setError(k as keyof AgentWorkInput, { message: v })
      toast.error(r.error)
      return
    }
    toast.success("Сохранено")
    router.push("/verifications")
    router.refresh()
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="flex max-w-3xl flex-col gap-4">
      <FormSection title="От компании" description={`Передан ${formatDate(job.handedAt)}`} icon={<BuildingIcon />}>
        <div className="grid gap-3 rounded-xl bg-muted/50 p-3 text-sm sm:grid-cols-2">
          <div>
            <div className="text-xs text-muted-foreground">Компания</div>
            <div className="font-medium">{job.companyName}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Телефон</div>
            <div className="font-medium">{job.phoneModel}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">IMEI1</div>
            <CopyText value={job.imei1} />
          </div>
          <div>
            <div className="text-xs text-muted-foreground">IMEI2</div>
            <CopyText value={job.imei2} />
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Серийный номер</div>
            <CopyText value={job.serialNumber} />
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Компания платит вам</div>
            <div className="font-semibold tabular-nums">
              {formatMoney(job.agentFee)}{" "}
              <span className={cn("text-xs font-normal", job.agentPaid ? "text-emerald-700" : "text-amber-700")}>
                {job.agentPaid ? "оплачено" : "не оплачено"}
              </span>
            </div>
          </div>
          {job.note && (
            <div className="sm:col-span-2">
              <div className="text-xs text-muted-foreground">Заметка компании</div>
              <div className="whitespace-pre-wrap">{job.note}</div>
            </div>
          )}
        </div>
      </FormSection>

      <FormSection
        title="Кому отдали IMEI"
        description="Человек, который был за границей. Компания его не видит."
        icon={<UserIcon />}
        actions={
          <Tabs value={mode} onValueChange={(v) => form.setValue("verifierMode", v as "none" | "existing" | "new")}>
            <TabsList>
              <TabsTrigger value="none">Ещё ищу</TabsTrigger>
              <TabsTrigger value="existing" disabled={verifiers.length === 0}>
                Из моих людей
              </TabsTrigger>
              <TabsTrigger value="new">Новый</TabsTrigger>
            </TabsList>
          </Tabs>
        }
      >
        {mode === "none" && (
          <p className="rounded-xl bg-muted/50 p-3 text-sm text-muted-foreground">
            Когда найдёте человека, выберите его здесь и поменяйте статус.
          </p>
        )}
        {mode === "existing" && (
          <FormField label="Человек" htmlFor="verifierId" required error={errors.verifierId?.message}>
            <Controller
              control={form.control}
              name="verifierId"
              render={({ field }) => (
                <Combobox
                  id="verifierId"
                  value={field.value}
                  onChange={field.onChange}
                  invalid={!!errors.verifierId}
                  placeholder="Выберите человека"
                  searchPlaceholder="ФИО или телефон…"
                  items={verifiers.map((v) => ({
                    value: v.id,
                    keywords: `${v.fullName} ${v.phone ?? ""}`,
                    selectedLabel: v.fullName,
                    render: (
                      <div className="flex flex-col">
                        <span>{v.fullName}</span>
                        <span className="text-xs text-muted-foreground">
                          {v.phone ?? "без телефона"} · верифицировал {v.verifiedCount}
                        </span>
                      </div>
                    ),
                  }))}
                />
              )}
            />
          </FormField>
        )}
        {mode === "new" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="ФИО" htmlFor="verifierName" required error={errors.verifierName?.message}>
              <Input id="verifierName" {...reg("verifierName")} />
            </FormField>
            <FormField label="Номер телефона" htmlFor="verifierPhone" error={errors.verifierPhone?.message}>
              <Input id="verifierPhone" type="tel" placeholder="+7 7__ ___ __ __" {...reg("verifierPhone")} />
            </FormField>
          </div>
        )}
        {mode !== "none" && (
          <FormField label="Из какой страны вернулся / где был" htmlFor="country" error={errors.country?.message}>
            <Controller
              control={form.control}
              name="country"
              render={({ field }) => (
                <CountrySelect id="country" value={field.value} onChange={field.onChange} invalid={!!errors.country} />
              )}
            />
          </FormField>
        )}
      </FormSection>

      <FormSection title="Статус и деньги" description="Сколько отдаёте человеку и ваша прибыль" icon={<ShieldCheckIcon />} className="sm:grid-cols-2">
        <FormField
          label="Статус"
          htmlFor="status"
          error={errors.status?.message}
          hint="Зарегистрировали — «Верифицирован». Пробовали, но IMEI нет в базе — «Не зарегистрирован». Компания получит уведомление."
        >
          <NativeSelect id="status" {...reg("status")}>
            {VERIFICATION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {VERIFICATION_STATUS_LABEL[s]}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label="Оплата человеку" htmlFor="payment" error={errors.payment?.message}>
          <Controller
            control={form.control}
            name="payment"
            render={({ field }) => <MoneyInput id="payment" value={field.value as string} onChange={field.onChange} />}
          />
        </FormField>
        <Label className="flex items-center gap-2 font-normal">
          <Controller
            control={form.control}
            name="isPaid"
            render={({ field }) => <Checkbox checked={!!field.value} onCheckedChange={(c) => field.onChange(!!c)} />}
          />
          Человеку оплачено
        </Label>
        <div className="flex items-center justify-between rounded-xl bg-muted px-3 py-2 text-sm">
          <span className="text-muted-foreground">Ваша прибыль</span>
          <span className={cn("font-semibold tabular-nums", profit < 0 ? "text-destructive" : "text-emerald-700")}>
            {formatMoney(profit)}
          </span>
        </div>
        <FormField label="Моя заметка" htmlFor="agentNote" error={errors.agentNote?.message} hint="Видите только вы" className="sm:col-span-2">
          <Textarea id="agentNote" rows={2} {...reg("agentNote")} />
        </FormField>
      </FormSection>

      <FormActions>
        <Button type="submit" size="lg" disabled={isSubmitting}>
          {isSubmitting ? "Сохранение…" : "Сохранить"}
        </Button>
        <Button type="button" size="lg" variant="outline" onClick={() => router.back()}>
          Отмена
        </Button>
      </FormActions>
    </form>
  )
}
