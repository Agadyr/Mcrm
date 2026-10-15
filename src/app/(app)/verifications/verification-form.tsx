"use client"

import { useRouter } from "next/navigation"
import { Controller, useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Combobox } from "@/components/combobox"
import { CountrySelect } from "@/components/country-select"
import { FormField } from "@/components/form-field"
import { FormActions, FormSection } from "@/components/form-section"
import { ScanButton } from "@/components/barcode-scanner"
import { BriefcaseIcon, ShieldCheckIcon, SmartphoneIcon, UserIcon } from "lucide-react"
import { MoneyInput } from "@/components/money-input"
import { NativeSelect } from "@/components/native-select"
import { PhoneStatusBadge } from "@/components/status-badge"
import { formatMemory, formatMoney } from "@/lib/format"
import Link from "next/link"
import { imeiWarning } from "@/lib/imei"
import { VERIFICATION_STATUS_LABEL, VERIFICATION_STATUSES } from "@/lib/labels"
import {
  DEFAULT_VERIFICATION_PAYMENT,
  missingForVerification,
  verificationSchema,
  type VerificationData,
  type VerificationInput,
} from "@/lib/validators/verification"
import { createVerificationAction, updateVerificationAction } from "@/server/actions/verifications"
import type { PhoneStatus } from "@prisma/client"

export type StockPhoneOption = {
  id: string
  model: string
  memoryGb: number | null
  color: string | null
  imei1: string
  imei2: string | null
  serialNumber: string | null
  status: PhoneStatus
}

export type VerifierOption = {
  id: string
  fullName: string
  phone: string | null
  verifiedCount: number
  totalCount: number
  paidSum: number
}

export type AgentOption = {
  id: string
  name: string
  phone: string | null
  companyName: string | null
  activeCount: number
  verifiedCount: number
  debtSum: number
}

export function VerificationForm({
  verificationId,
  defaultValues,
  phones,
  verifiers,
  agents = [],
  viewerRole = "company",
}: {
  verificationId?: string
  defaultValues: VerificationInput
  phones: StockPhoneOption[]
  verifiers: VerifierOption[]
  /** верификаторы-аккаунты — компания может передать им телефон */
  agents?: AgentOption[]
  viewerRole?: "company" | "verifier"
}) {
  const router = useRouter()
  const form = useForm<VerificationInput, unknown, VerificationData>({
    resolver: zodResolver(verificationSchema),
    defaultValues,
  })
  // начальные значения сразу в разметке — поля не пустые и до загрузки скриптов
  const reg = (name: Parameters<typeof form.register>[0]) => ({
    ...form.register(name),
    defaultValue: String((defaultValues as Record<string, unknown>)[name] ?? ""),
  })
  /** значение со сканера: подставить и проверить поле */
  const setScanned = (name: "imei1" | "imei2" | "serialNumber", value: string) =>
    form.setValue(name, value, { shouldValidate: true, shouldDirty: true })
  const { errors, isSubmitting } = form.formState
  const [phoneMode, phoneId, verifierMode, verifierId, imei1, imei2] = useWatch({
    control: form.control,
    name: ["phoneMode", "phoneId", "verifierMode", "verifierId", "imei1", "imei2"],
  })
  const selectedPhone = phones.find((p) => p.id === phoneId)
  const selectedMissing = selectedPhone ? missingForVerification(selectedPhone) : []
  const selectedVerifier = verifiers.find((v) => v.id === verifierId)
  const agentId = useWatch({ control: form.control, name: "agentId" })
  const selectedAgent = agents.find((a) => a.id === agentId)
  const toAgent = verifierMode === "agent"
  const isVerifier = viewerRole === "verifier"

  async function onSubmit() {
    const values = form.getValues()
    if (values.phoneMode === "stock" && selectedMissing.length) {
      form.setError("phoneId", { message: `У телефона не заполнено: ${selectedMissing.join(", ")}` })
      return
    }
    const result = verificationId
      ? await updateVerificationAction(verificationId, values)
      : await createVerificationAction(values)
    if (!result.ok) {
      for (const [k, v] of Object.entries(result.fieldErrors ?? {}))
        form.setError(k as keyof VerificationInput, { message: v })
      toast.error(result.error)
      return
    }
    toast.success(verificationId ? "Изменения сохранены" : "Верификация создана")
    router.push("/verifications")
    router.refresh()
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="flex max-w-3xl flex-col gap-4">
      {/* ── Телефон ── */}
      <FormSection
        title="Телефон"
        description={isVerifier ? "Телефон клиента: модель, IMEI1, IMEI2 и серийный номер" : "Нужны IMEI1, IMEI2 и серийный номер"}
        icon={<SmartphoneIcon />}
        actions={
          // у верификатора нет склада — только ручной ввод
          !isVerifier && <Tabs
            value={phoneMode}
            onValueChange={(v) => form.setValue("phoneMode", v as "stock" | "manual", { shouldValidate: false })}
          >
            <TabsList>
              <TabsTrigger value="stock">Проданные</TabsTrigger>
              <TabsTrigger value="manual">Телефон клиента</TabsTrigger>
            </TabsList>
          </Tabs>
        }
      >

        {phoneMode === "stock" ? (
          <>
            <FormField
              label="Проданный телефон"
              htmlFor="phoneId"
              required
              error={errors.phoneId?.message}
              hint={
                phones.length === 0
                  ? "Нет проданных телефонов без верификации. На верификацию идёт только проданный телефон."
                  : "Только проданные. Поиск по модели или IMEI"
              }
            >
              <Controller
                control={form.control}
                name="phoneId"
                render={({ field }) => (
                  <Combobox
                    id="phoneId"
                    value={field.value}
                    onChange={field.onChange}
                    invalid={!!errors.phoneId}
                    placeholder="Выберите телефон"
                    searchPlaceholder="Модель или IMEI…"
                    items={phones.map((p) => ({
                      value: p.id,
                      keywords: [p.model, formatMemory(p.memoryGb), p.color, p.imei1, p.imei2, p.serialNumber].filter(Boolean).join(" "),
                      selectedLabel: (
                        <span>
                          {p.model} {formatMemory(p.memoryGb)} {p.color}
                          <span className="ml-2 font-mono text-xs text-muted-foreground">{p.imei1}</span>
                        </span>
                      ),
                      render: (
                        <div className="flex flex-col">
                          <span>
                            {[p.model, formatMemory(p.memoryGb), p.color].filter(Boolean).join(" · ")}
                            {p.status !== "SOLD" && <PhoneStatusBadge status={p.status} className="ml-2" />}
                          </span>
                          <span className="font-mono text-xs text-muted-foreground">
                            {p.imei1}
                            {p.imei2 ? ` / ${p.imei2}` : ""}
                          </span>
                          {missingForVerification(p).length > 0 && (
                            <span className="text-xs text-amber-700 dark:text-amber-400">
                              Не заполнено: {missingForVerification(p).join(", ")}
                            </span>
                          )}
                        </div>
                      ),
                    }))}
                  />
                )}
              />
            </FormField>
            {selectedPhone && selectedMissing.length > 0 && (
              <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                Для верификации нужны IMEI1, IMEI2 и серийный номер. У этого телефона не заполнено:{" "}
                <b>{selectedMissing.join(", ")}</b>.{" "}
                <Link href={`/phones/${selectedPhone.id}/edit`} target="_blank" className="font-medium underline">
                  Дополнить карточку
                </Link>{" "}
                и обновите страницу.
              </div>
            )}
            {selectedPhone && (
              <div className="grid gap-2 rounded-lg bg-muted/50 p-3 text-sm sm:grid-cols-2">
                <Info label="Модель" value={selectedPhone.model} />
                <Info label="IMEI1" value={selectedPhone.imei1} mono />
                <Info label="IMEI2" value={selectedPhone.imei2} mono />
                <Info label="Серийный номер" value={selectedPhone.serialNumber} mono />
              </div>
            )}
          </>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <ScanButton
              mode="box"
              label="Сканировать коробку"
              className="sm:col-span-2 sm:justify-self-start"
              onResult={([i1, i2, sn]) => {
                if (i1) setScanned("imei1", i1)
                if (i2) setScanned("imei2", i2)
                if (sn) setScanned("serialNumber", sn)
                const done = [i1 && "IMEI1", i2 && "IMEI2", sn && "серийный номер"].filter(Boolean)
                toast.success(`Заполнено: ${done.join(", ")}`)
              }}
            />
            <FormField label="Модель" htmlFor="phoneModel" required error={errors.phoneModel?.message} className="sm:col-span-2">
              <Input id="phoneModel" placeholder="iPhone 15 Pro" {...reg("phoneModel")} />
            </FormField>
            <FormField label="IMEI1" htmlFor="imei1" required error={errors.imei1?.message} warning={imeiWarning(imei1)}>
              <Input id="imei1" inputMode="numeric" className="font-mono" {...reg("imei1")} />
            </FormField>
            <FormField label="IMEI2" htmlFor="imei2" required error={errors.imei2?.message} warning={imeiWarning(imei2)}>
              <Input id="imei2" inputMode="numeric" className="font-mono" {...reg("imei2")} />
            </FormField>
            <FormField label="Серийный номер" htmlFor="serialNumber" required error={errors.serialNumber?.message}>
              <div className="flex gap-2">
                <Input id="serialNumber" className="font-mono uppercase" {...reg("serialNumber")} />
                <ScanButton mode="serial" label={null} onResult={([v]) => setScanned("serialNumber", v)} />
              </div>
            </FormField>
          </div>
        )}
      </FormSection>

      {/* ── Человек ── */}
      <FormSection
        title="Кому отдали"
        description={
          toAgent ? "Верификатор сам найдёт человека, который был за границей" : "Человек, который проводит верификацию"
        }
        icon={<UserIcon />}
        actions={
          <Tabs
            value={verifierMode}
            onValueChange={(v) => form.setValue("verifierMode", v as "existing" | "new" | "agent")}
          >
            <TabsList>
              {agents.length > 0 && <TabsTrigger value="agent">Верификатору</TabsTrigger>}
              <TabsTrigger value="existing" disabled={verifiers.length === 0}>
                {agents.length > 0 ? "Человеку" : "Из справочника"}
              </TabsTrigger>
              <TabsTrigger value="new">Новый человек</TabsTrigger>
            </TabsList>
          </Tabs>
        }
      >
        {toAgent ? (
          <>
            <FormField label="Верификатор" htmlFor="agentId" required error={errors.agentId?.message}>
              <Controller
                control={form.control}
                name="agentId"
                render={({ field }) => (
                  <Combobox
                    id="agentId"
                    value={field.value}
                    onChange={field.onChange}
                    invalid={!!errors.agentId}
                    placeholder="Выберите верификатора"
                    searchPlaceholder="Имя или телефон…"
                    items={agents.map((a) => ({
                      value: a.id,
                      keywords: `${a.name} ${a.phone ?? ""} ${a.companyName ?? ""}`,
                      selectedLabel: a.name,
                      render: (
                        <div className="flex flex-col">
                          <span>{a.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {[a.phone, a.companyName].filter(Boolean).join(" · ") || "верификатор"} · у вас в работе {a.activeCount}
                          </span>
                        </div>
                      ),
                    }))}
                  />
                )}
              />
            </FormField>
            {selectedAgent && (
              <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted/50 p-3 text-sm">
                <Info label="Телефон" value={selectedAgent.phone} />
                <Info label="В работе / готово" value={`${selectedAgent.activeCount} / ${selectedAgent.verifiedCount}`} />
                <Info label="Вы должны" value={formatMoney(selectedAgent.debtSum)} />
              </div>
            )}
          </>
        ) : verifierMode === "existing" ? (
          <>
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
            {selectedVerifier && (
              <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted/50 p-3 text-sm">
                <Info label="Телефон" value={selectedVerifier.phone} />
                <Info label="Верифицировал" value={`${selectedVerifier.verifiedCount} из ${selectedVerifier.totalCount}`} />
                <Info label="Выплачено" value={formatMoney(selectedVerifier.paidSum)} />
              </div>
            )}
          </>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="ФИО" htmlFor="verifierName" required error={errors.verifierName?.message}>
              <Input id="verifierName" {...reg("verifierName")} />
            </FormField>
            <FormField label="Номер телефона" htmlFor="verifierPhone" error={errors.verifierPhone?.message}>
              <Input id="verifierPhone" type="tel" placeholder="+7 7__ ___ __ __" {...reg("verifierPhone")} />
            </FormField>
          </div>
        )}
        {!toAgent && isVerifier && (
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

      {/* ── Верификация ── */}
      {toAgent ? (
        <FormSection
          title="Передача верификатору"
          description="Сколько вы платите верификатору за этот телефон. Статус он ведёт сам."
          icon={<BriefcaseIcon />}
          className="sm:grid-cols-2"
        >
          <FormField label="Дата передачи" htmlFor="handedAt" required error={errors.handedAt?.message}>
            <Input id="handedAt" type="date" {...reg("handedAt")} />
          </FormField>
          <FormField
            label="Сумма верификатору"
            htmlFor="agentFee"
            error={errors.agentFee?.message}
            hint={`По умолчанию ${formatMoney(DEFAULT_VERIFICATION_PAYMENT)}, можно изменить`}
          >
            <Controller
              control={form.control}
              name="agentFee"
              render={({ field }) => <MoneyInput id="agentFee" value={field.value as string} onChange={field.onChange} />}
            />
          </FormField>
          <Label className="flex items-center gap-2 font-normal sm:col-span-2">
            <Controller
              control={form.control}
              name="agentPaid"
              render={({ field }) => <Checkbox checked={!!field.value} onCheckedChange={(c) => field.onChange(!!c)} />}
            />
            Верификатору уже оплачено
          </Label>
          <FormField label="Заметка" htmlFor="note" error={errors.note?.message} className="sm:col-span-2">
            <Textarea id="note" rows={2} {...reg("note")} />
          </FormField>
        </FormSection>
      ) : (
        <FormSection
          title="Верификация"
          description={isVerifier ? "Дата, статус, сколько заплатят вам и сколько вы платите человеку" : "Дата, статус и оплата человеку"}
          icon={<ShieldCheckIcon />}
          className="sm:grid-cols-2"
        >
          <FormField label="Дата передачи IMEI" htmlFor="handedAt" required error={errors.handedAt?.message}>
            <Input id="handedAt" type="date" {...reg("handedAt")} />
          </FormField>
          <FormField label="Статус" htmlFor="status" error={errors.status?.message}>
            <NativeSelect id="status" {...reg("status")}>
              {VERIFICATION_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {VERIFICATION_STATUS_LABEL[s]}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          {isVerifier && (
            <>
              <FormField label="Мне заплатят (клиент)" htmlFor="agentFee" error={errors.agentFee?.message} hint="Ваш доход за этот телефон">
                <Controller
                  control={form.control}
                  name="agentFee"
                  render={({ field }) => <MoneyInput id="agentFee" value={field.value as string} onChange={field.onChange} />}
                />
              </FormField>
              <div className="flex items-end pb-2">
                <Label className="flex items-center gap-2 font-normal">
                  <Controller
                    control={form.control}
                    name="agentPaid"
                    render={({ field }) => <Checkbox checked={!!field.value} onCheckedChange={(c) => field.onChange(!!c)} />}
                  />
                  Клиент оплатил
                </Label>
              </div>
            </>
          )}
          <FormField
            label="Оплата человеку"
            htmlFor="payment"
            error={errors.payment?.message}
            hint={isVerifier ? "Сколько вы отдаёте человеку" : `По умолчанию ${formatMoney(DEFAULT_VERIFICATION_PAYMENT)}, можно изменить`}
          >
            <Controller
              control={form.control}
              name="payment"
              render={({ field }) => <MoneyInput id="payment" value={field.value as string} onChange={field.onChange} />}
            />
          </FormField>
          <div className="flex items-end pb-2">
            <Label className="flex items-center gap-2 font-normal">
              <Controller
                control={form.control}
                name="isPaid"
                render={({ field }) => <Checkbox checked={!!field.value} onCheckedChange={(c) => field.onChange(!!c)} />}
              />
              Человеку оплачено
            </Label>
          </div>
          <FormField label="Заметка" htmlFor="note" error={errors.note?.message} className="sm:col-span-2">
            <Textarea id="note" rows={3} {...reg("note")} />
          </FormField>
        </FormSection>
      )}

      <FormActions>
        <Button type="submit" size="lg" disabled={isSubmitting}>
          {isSubmitting ? "Сохранение…" : verificationId ? "Сохранить" : toAgent ? "Передать верификатору" : "Создать верификацию"}
        </Button>
        <Button type="button" size="lg" variant="outline" onClick={() => router.back()}>
          Отмена
        </Button>
      </FormActions>
    </form>
  )
}

function Info({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={mono ? "font-mono text-[0.85em] break-all" : "break-words"}>{value || "—"}</div>
    </div>
  )
}
