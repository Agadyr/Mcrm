"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Controller, useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { FormField } from "@/components/form-field"
import { FormActions, FormSection } from "@/components/form-section"
import { ScanButton } from "@/components/barcode-scanner"
import { HashIcon, SmartphoneIcon, WalletIcon } from "lucide-react"
import { MoneyInput } from "@/components/money-input"
import { NativeSelect } from "@/components/native-select"
import { imeiWarning, normalizeImei } from "@/lib/imei"
import { PHONE_STATUS_LABEL } from "@/lib/labels"
import { phoneSchema, type PhoneData, type PhoneInput } from "@/lib/validators/phone"
import { checkImeiAction, createPhoneAction, updatePhoneAction } from "@/server/actions/phones"
import type { ImeiConflict } from "@/server/imei-conflicts"

const MEMORY_OPTIONS = [64, 128, 256, 512, 1024]

export function PhoneForm({
  phoneId,
  defaultValues,
  suppliers,
  models,
}: {
  phoneId?: string
  defaultValues: PhoneInput
  suppliers: string[]
  models: string[]
}) {
  const router = useRouter()
  const form = useForm<PhoneInput, unknown, PhoneData>({
    resolver: zodResolver(phoneSchema),
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
  const [imei1, imei2] = useWatch({ control: form.control, name: ["imei1", "imei2"] })
  const status = useWatch({ control: form.control, name: "status" })
  const isSold = defaultValues.status === "SOLD"

  async function onSubmit() {
    const values = form.getValues()
    const result = phoneId ? await updatePhoneAction(phoneId, values) : await createPhoneAction(values)
    if (!result.ok) {
      for (const [k, v] of Object.entries(result.fieldErrors ?? {})) form.setError(k as keyof PhoneInput, { message: v })
      toast.error(result.error)
      return
    }
    toast.success(phoneId ? "Изменения сохранены" : "Телефон добавлен")
    router.push(`/phones/${result.data.id}`)
    router.refresh()
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="flex max-w-3xl flex-col gap-4">
      <FormSection title="Телефон" description="Модель, память, цвет и состояние" icon={<SmartphoneIcon />} className="sm:grid-cols-2">
        <FormField label="Модель" htmlFor="model" required error={errors.model?.message} className="sm:col-span-2">
          <Input id="model" list="models-list" placeholder="iPhone 15 Pro" autoFocus={!phoneId} {...reg("model")} />
          <datalist id="models-list">
            {models.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </FormField>
        <FormField label="Память" htmlFor="memoryGb" error={errors.memoryGb?.message}>
          <NativeSelect id="memoryGb" {...reg("memoryGb")}>
            <option value="">—</option>
            {[...new Set([...MEMORY_OPTIONS, Number(defaultValues.memoryGb) || 0])]
              .filter(Boolean)
              .sort((a, b) => a - b)
              .map((m) => (
              <option key={m} value={m}>
                {m >= 1024 ? `${m / 1024} ТБ` : `${m} ГБ`}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label="Цвет" htmlFor="color" error={errors.color?.message}>
          <Input id="color" placeholder="Чёрный титан" {...reg("color")} />
        </FormField>
        <FormField label="Состояние" htmlFor="condition" error={errors.condition?.message}>
          <NativeSelect id="condition" {...reg("condition")}>
            <option value="NEW">Новый</option>
            <option value="USED">Б/у</option>
          </NativeSelect>
        </FormField>
        <FormField
          label="Статус"
          htmlFor="status"
          error={errors.status?.message}
          hint={
            isSold
              ? "Телефон продан. Чтобы изменить статус, отмените продажу."
              : status === "ON_VERIFICATION"
                ? "Обычно меняется автоматически из раздела «Верификация»"
                : "«Продан» ставится кнопкой «Продать»"
          }
        >
          <NativeSelect id="status" disabled={isSold} {...reg("status")}>
            {(isSold
              ? (["SOLD"] as const)
              : (["IN_STOCK", "ON_VERIFICATION", "RESERVED", "RETURNED"] as const)
            ).map((s) => (
              <option key={s} value={s}>
                {PHONE_STATUS_LABEL[s]}
              </option>
            ))}
          </NativeSelect>
        </FormField>
      </FormSection>

      <FormSection
        title="IMEI и серийный номер"
        description="IMEI — 15 цифр, есть в коробке или *#06#"
        icon={<HashIcon />}
        className="sm:grid-cols-2"
        actions={
          <ScanButton
            mode="box"
            label="Сканировать коробку"
            onResult={([i1, i2, sn]) => {
              if (i1) setScanned("imei1", i1)
              if (i2) setScanned("imei2", i2)
              if (sn) setScanned("serialNumber", sn)
              const done = [i1 && "IMEI1", i2 && "IMEI2", sn && "серийный номер"].filter(Boolean)
              toast.success(`Заполнено: ${done.join(", ")}`)
            }}
          />
        }
      >
        <ImeiField
          id="imei1"
          label="IMEI1"
          required
          value={imei1}
          excludeId={phoneId}
          error={errors.imei1?.message}
          register={reg("imei1")}
        />
        <ImeiField
          id="imei2"
          label="IMEI2"
          value={imei2 ?? ""}
          excludeId={phoneId}
          error={errors.imei2?.message}
          register={reg("imei2")}
        />
        <FormField label="Серийный номер" htmlFor="serialNumber" error={errors.serialNumber?.message}>
          <div className="flex gap-2">
            <Input id="serialNumber" className="font-mono uppercase" autoCapitalize="characters" {...reg("serialNumber")} />
            <ScanButton mode="serial" label={null} onResult={([v]) => setScanned("serialNumber", v)} />
          </div>
        </FormField>
      </FormSection>

      <FormSection title="Закупка" description="Сколько заплатили и у кого купили" icon={<WalletIcon />} className="sm:grid-cols-2">
        <FormField label="Цена закупки" htmlFor="purchasePrice" required error={errors.purchasePrice?.message}>
          <Controller
            control={form.control}
            name="purchasePrice"
            render={({ field }) => (
              <MoneyInput id="purchasePrice" value={field.value as string} onChange={field.onChange} onBlur={field.onBlur} />
            )}
          />
        </FormField>
        <FormField label="Дата поступления" htmlFor="receivedAt" required error={errors.receivedAt?.message}>
          <Input id="receivedAt" type="date" {...reg("receivedAt")} />
        </FormField>
        <FormField label="Поставщик" htmlFor="supplier" error={errors.supplier?.message} className="sm:col-span-2">
          <Input id="supplier" list="suppliers-list" placeholder="У кого купили" {...reg("supplier")} />
          <datalist id="suppliers-list">
            {suppliers.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </FormField>
        <FormField label="Заметка" htmlFor="note" error={errors.note?.message} className="sm:col-span-2">
          <Textarea id="note" rows={3} {...reg("note")} />
        </FormField>
      </FormSection>

      <FormActions>
        <Button type="submit" size="lg" disabled={isSubmitting}>
          {isSubmitting ? "Сохранение…" : phoneId ? "Сохранить" : "Добавить телефон"}
        </Button>
        <Button type="button" size="lg" variant="outline" onClick={() => router.back()}>
          Отмена
        </Button>
      </FormActions>
    </form>
  )
}

/** Поле IMEI: предупреждение по формату/Луна + проверка дублей в базе */
function ImeiField({
  id,
  label,
  required,
  value,
  excludeId,
  error,
  register,
}: {
  id: string
  label: string
  required?: boolean
  value: string | null | undefined
  excludeId?: string
  error?: string
  register: ReturnType<ReturnType<typeof useForm<PhoneInput>>["register"]>
}) {
  const [conflict, setConflict] = useState<ImeiConflict | null>(null)
  const normalized = normalizeImei(value)

  useEffect(() => {
    setConflict(null)
    if (normalized.length < 14) return
    let cancelled = false
    const t = setTimeout(async () => {
      const c = await checkImeiAction(normalized, excludeId)
      if (!cancelled) setConflict(c)
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [normalized, excludeId])

  const warning = conflict ? (
    <span className="text-destructive">
      Этот IMEI уже записан:{" "}
      <Link href={`/phones/${conflict.phoneId}`} target="_blank" className="font-medium underline">
        {conflict.title}
      </Link>
    </span>
  ) : (
    imeiWarning(value)
  )

  return (
    <FormField label={label} htmlFor={id} required={required} error={error} warning={warning} hint="15 цифр">
      <Input
        id={id}
        inputMode="numeric"
        autoComplete="off"
        className="font-mono tracking-wide"
        maxLength={24}
        aria-invalid={!!error || !!conflict}
        {...register}
      />
    </FormField>
  )
}
