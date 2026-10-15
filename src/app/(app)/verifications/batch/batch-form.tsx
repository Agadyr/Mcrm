"use client"

import { useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { BriefcaseIcon, ListChecksIcon, PencilLineIcon, SearchIcon, SendIcon, SmartphoneIcon, XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Combobox } from "@/components/combobox"
import { FormField } from "@/components/form-field"
import { FormActions, FormSection } from "@/components/form-section"
import { MoneyInput } from "@/components/money-input"
import { ScanButton } from "@/components/barcode-scanner"
import { formatMemory, formatMoney } from "@/lib/format"
import { imeiWarning } from "@/lib/imei"
import { cn } from "@/lib/utils"
import { DEFAULT_VERIFICATION_PAYMENT, missingForVerification } from "@/lib/validators/verification"
import { createBatchHandoverAction } from "@/server/actions/verifications"
import type { AgentOption, StockPhoneOption } from "../verification-form"

/** Строка списка «Передаются»: телефон из товаров (phoneId) или введённый вручную */
type Row = {
  key: number
  phoneId?: string
  phoneModel: string
  imei1: string
  imei2: string
  serialNumber: string
  agentFee: string
}

/** Телефон из товаров, который сейчас нельзя отдать (не продан или уже на верификации) */
export type BlockedPhone = {
  model: string
  imei1: string
  imei2: string | null
  reason: string
}

const phoneTitle = (p: StockPhoneOption) => [p.model, formatMemory(p.memoryGb), p.color].filter(Boolean).join(" · ")
const parseFee = (v: string) => Number(v.replace(/\D/g, "")) || 0

export function BatchHandoverForm({
  phones,
  blocked,
  agents,
  defaultAgentId,
  defaultPhoneIds,
  today,
}: {
  phones: StockPhoneOption[]
  blocked: BlockedPhone[]
  agents: AgentOption[]
  defaultAgentId: string
  defaultPhoneIds: string[]
  today: string
}) {
  const router = useRouter()
  const nextKey = useRef(0)
  const newKey = () => ++nextKey.current

  const [agentId, setAgentId] = useState(defaultAgentId)
  const [commonFee, setCommonFee] = useState(String(DEFAULT_VERIFICATION_PAYMENT))
  const [rows, setRows] = useState<Row[]>(() => defaultPhoneIds.map((id) => stockRow(id, String(DEFAULT_VERIFICATION_PAYMENT))))
  const [query, setQuery] = useState("")
  const [handedAt, setHandedAt] = useState(today)
  const [agentPaid, setAgentPaid] = useState(false)
  const [note, setNote] = useState("")
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  function stockRow(phoneId: string, agentFee: string): Row {
    return {
      key: newKey(),
      phoneId,
      phoneModel: "",
      imei1: "",
      imei2: "",
      serialNumber: "",
      agentFee,
    }
  }

  const selectedAgent = agents.find((a) => a.id === agentId)
  const selectedIds = new Set(rows.map((r) => r.phoneId).filter(Boolean))
  const total = rows.reduce((a, r) => a + parseFee(r.agentFee), 0)

  const found = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return phones
    return phones.filter((p) =>
      [p.model, formatMemory(p.memoryGb), p.color, p.imei1, p.imei2, p.serialNumber]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q)
    )
  }, [phones, query])
  const foundReady = found.filter((p) => missingForVerification(p).length === 0)

  function togglePhone(id: string, on: boolean) {
    setRows((rs) => (on ? [...rs, stockRow(id, commonFee)] : rs.filter((r) => r.phoneId !== id)))
  }

  function selectAllFound() {
    setRows((rs) => {
      const have = new Set(rs.map((r) => r.phoneId))
      return [...rs, ...foundReady.filter((p) => !have.has(p.id)).map((p) => stockRow(p.id, commonFee))]
    })
  }

  function updateRow(key: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }

  function addManual(values: Partial<Row> = {}) {
    const row: Row = {
      key: newKey(),
      phoneModel: "",
      imei1: "",
      imei2: "",
      serialNumber: "",
      agentFee: commonFee,
      ...values,
    }
    setRows((rs) => [...rs, row])
    // фокус на модели новой строки — её нужно вписать руками
    setTimeout(() => document.getElementById(`row-${row.key}-model`)?.focus(), 50)
  }

  /** Сумма «за каждый телефон» меняется сразу у всех строк — отдельные можно поправить ниже */
  function changeCommonFee(v: string) {
    setCommonFee(v)
    setRows((rs) => rs.map((r) => ({ ...r, agentFee: v })))
  }

  /** Отсканировали коробку: телефон есть в товарах — отмечаем его, нет — добавляем строку вручную */
  function onScan([i1, i2, sn]: string[]) {
    const codes = [i1, i2].filter(Boolean)
    const stock = phones.find(
      (p) => codes.some((c) => c === p.imei1 || c === p.imei2) || (!!sn && p.serialNumber?.toUpperCase() === sn)
    )
    if (!stock) {
      const anyCode = [i1, i2].filter(Boolean)
      const known = blocked.find((x) => anyCode.includes(x.imei1) || (!!x.imei2 && anyCode.includes(x.imei2)))
      if (known) return toast.error(`${known.model}: ${known.reason}`)
    }
    if (stock) {
      if (selectedIds.has(stock.id)) return toast.info(`${stock.model} уже в списке`)
      const missing = missingForVerification(stock)
      if (missing.length) return toast.error(`${stock.model}: в карточке не заполнено ${missing.join(", ")}`)
      togglePhone(stock.id, true)
      return toast.success(`Добавлен: ${phoneTitle(stock)}`)
    }
    const dup = rows.find((r) => !r.phoneId && codes.some((c) => c === r.imei1 || c === r.imei2))
    if (dup) return toast.info("Этот телефон уже в списке")
    addManual({ imei1: i1 ?? "", imei2: i2 ?? "", serialNumber: sn ?? "" })
    toast.success("Телефона нет в товарах — впишите модель")
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (!agentId) errs.agentId = "Выберите верификатора"
    if (!rows.length) errs.items = "Отметьте хотя бы один телефон"
    if (Object.keys(errs).length) {
      setErrors(errs)
      toast.error(Object.values(errs)[0])
      return
    }
    setSubmitting(true)
    const result = await createBatchHandoverAction({
      agentId,
      handedAt,
      agentPaid,
      note,
      items: rows.map((r) =>
        r.phoneId
          ? { phoneId: r.phoneId, agentFee: r.agentFee }
          : {
              phoneModel: r.phoneModel,
              imei1: r.imei1,
              imei2: r.imei2,
              serialNumber: r.serialNumber,
              agentFee: r.agentFee,
            }
      ),
    })
    setSubmitting(false)
    if (!result.ok) {
      setErrors(result.fieldErrors ?? {})
      toast.error(result.error)
      return
    }
    toast.success(`Передано верификатору: ${result.data.ids.length} шт. на ${formatMoney(total)}`)
    router.push(`/verifications?verifier=${agentId}`)
    router.refresh()
  }

  const rowError = (i: number, field: string) => errors[`items.${i}.${field}`]

  return (
    <form onSubmit={onSubmit} className="flex max-w-3xl flex-col gap-4">
      {/* ── 1. Кому ── */}
      <FormSection
        title="1. Кому передаёте"
        description="Верификатор сам найдёт людей и будет вести статус каждого телефона"
        icon={<BriefcaseIcon />}
      >
        <FormField label="Верификатор" htmlFor="agentId" required error={errors.agentId}>
          <Combobox
            id="agentId"
            value={agentId}
            onChange={(v) => {
              setAgentId(v)
              setErrors((e) => ({ ...e, agentId: "" }))
            }}
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
        </FormField>
        {selectedAgent && (
          <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted/50 p-3 text-sm">
            <Info label="Телефон" value={selectedAgent.phone} />
            <Info label="В работе / готово" value={`${selectedAgent.activeCount} / ${selectedAgent.verifiedCount}`} />
            <Info label="Вы должны" value={formatMoney(selectedAgent.debtSum)} />
          </div>
        )}
      </FormSection>

      {/* ── 2. Выбор телефонов ── */}
      <FormSection
        title="2. Отметьте телефоны"
        description="Только проданные телефоны. Можно отсканировать коробку или ввести телефон клиента вручную"
        icon={<SmartphoneIcon />}
        actions={
          <div className="flex flex-wrap gap-2">
            <ScanButton mode="box" label="Сканировать коробку" onResult={onScan} />
            <Button type="button" variant="outline" onClick={() => addManual()}>
              <PencilLineIcon /> Телефон клиента
            </Button>
          </div>
        }
      >
        {phones.length === 0 ? (
          <p className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
            Нет проданных телефонов без верификации. На верификацию идёт только проданный телефон — сначала оформите продажу.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-0 flex-1">
                <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Найти: модель или IMEI"
                  className="pl-8"
                  aria-label="Поиск телефона в товарах"
                />
              </div>
              {foundReady.some((p) => !selectedIds.has(p.id)) && (
                <Button type="button" variant="ghost" size="sm" onClick={selectAllFound}>
                  <ListChecksIcon /> Отметить все{query ? " найденные" : ""} (
                  {foundReady.filter((p) => !selectedIds.has(p.id)).length})
                </Button>
              )}
            </div>
            <ul className="max-h-80 divide-y overflow-y-auto rounded-xl border">
              {found.length === 0 && <li className="p-3 text-sm text-muted-foreground">Ничего не найдено</li>}
              {found.map((p) => {
                const missing = missingForVerification(p)
                const checked = selectedIds.has(p.id)
                return (
                  <li key={p.id}>
                    <label
                      className={cn(
                        "flex cursor-pointer items-start gap-3 px-3 py-2.5 text-sm transition-colors hover:bg-muted/50",
                        checked && "bg-primary/5",
                        missing.length > 0 && "cursor-not-allowed opacity-60"
                      )}
                    >
                      <Checkbox
                        className="mt-0.5"
                        checked={checked}
                        disabled={missing.length > 0}
                        onCheckedChange={(c) => togglePhone(p.id, !!c)}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">{phoneTitle(p)}</div>
                        <div className="font-mono text-xs break-all text-muted-foreground">
                          {p.imei1}
                          {p.imei2 ? ` / ${p.imei2}` : ""}
                        </div>
                        {missing.length > 0 && (
                          <div className="text-xs text-amber-700 dark:text-amber-400">Не заполнено: {missing.join(", ")}</div>
                        )}
                      </div>
                    </label>
                  </li>
                )
              })}
            </ul>
          </>
        )}
        {errors.items && <p className="text-xs text-destructive">{errors.items}</p>}
      </FormSection>

      {/* ── 3. Что передаётся ── */}
      <FormSection
        title={`3. Передаются${rows.length ? ` — ${rows.length} шт.` : ""}`}
        description={
          rows.length
            ? "Проверьте список и суммы. Сумму отдельного телефона можно изменить."
            : "Отмеченные телефоны появятся здесь"
        }
        icon={<SendIcon />}
      >
        <FormField
          label="Сумма верификатору за каждый телефон"
          htmlFor="commonFee"
          hint={`По умолчанию ${formatMoney(DEFAULT_VERIFICATION_PAYMENT)}. Меняет сумму у всех телефонов в списке.`}
          className="sm:max-w-xs"
        >
          <MoneyInput id="commonFee" value={commonFee} onChange={changeCommonFee} />
        </FormField>

        {rows.length > 0 && (
          <ol className="flex flex-col gap-2">
            {rows.map((r, i) => {
              const stock = r.phoneId ? phones.find((p) => p.id === r.phoneId) : undefined
              return (
                <li key={r.key} className={cn("rounded-xl border p-3", rowError(i, "phoneId") && "border-destructive")}>
                  <div className="flex flex-wrap items-start gap-x-3 gap-y-2 sm:flex-nowrap">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-primary">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1 basis-[calc(100%-2.5rem)] sm:basis-0">
                      {stock ? (
                        <>
                          <div className="font-medium">{phoneTitle(stock)}</div>
                          <div className="font-mono text-xs break-all text-muted-foreground">
                            {stock.imei1} / {stock.imei2} · S/N {stock.serialNumber}
                          </div>
                          {rowError(i, "phoneId") && <p className="text-xs text-destructive">{rowError(i, "phoneId")}</p>}
                        </>
                      ) : (
                        <ManualPhone row={r} index={i} error={rowError} onChange={(patch) => updateRow(r.key, patch)} />
                      )}
                    </div>
                    {/* на телефоне сумма уходит под данные телефона, чтобы не сжимать IMEI */}
                    <div className="ml-10 flex shrink-0 items-center gap-1 sm:ml-0">
                      <MoneyInput
                        aria-label={`Сумма за телефон №${i + 1}`}
                        value={r.agentFee}
                        onChange={(v) => updateRow(r.key, { agentFee: v })}
                        className="w-28 sm:w-32"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                        aria-label={`Убрать телефон №${i + 1} из списка`}
                        title="Убрать из списка"
                      >
                        <XIcon />
                      </Button>
                    </div>
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </FormSection>

      {/* ── 4. Детали передачи ── */}
      <FormSection title="4. Передача" description="Общие для всех телефонов" icon={<BriefcaseIcon />} className="sm:grid-cols-2">
        <FormField label="Дата передачи" htmlFor="handedAt" required error={errors.handedAt}>
          <Input id="handedAt" type="date" value={handedAt} onChange={(e) => setHandedAt(e.target.value)} />
        </FormField>
        <div className="flex items-end pb-2">
          <Label className="flex items-center gap-2 font-normal">
            <Checkbox checked={agentPaid} onCheckedChange={(c) => setAgentPaid(!!c)} />
            Верификатору уже оплачено за все
          </Label>
        </div>
        <FormField label="Заметка" htmlFor="note" error={errors.note} className="sm:col-span-2">
          <Textarea id="note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </FormField>
      </FormSection>

      {rows.length > 0 && (
        <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-2xl border bg-secondary/60 px-4 py-3 text-sm">
          <span>
            {selectedAgent ? <b>{selectedAgent.name}</b> : "Верификатор не выбран"} получает <b>{rows.length} шт.</b>
          </span>
          <span>
            Итого верификатору: <b className="text-base tabular-nums">{formatMoney(total)}</b>
          </span>
        </div>
      )}

      <FormActions>
        <Button type="submit" size="lg" disabled={submitting || rows.length === 0}>
          <SendIcon />
          {submitting ? "Передаём…" : rows.length ? `Передать ${rows.length} шт. · ${formatMoney(total)}` : "Отметьте телефоны"}
        </Button>
        <Button type="button" size="lg" variant="outline" onClick={() => router.back()}>
          Отмена
        </Button>
      </FormActions>
    </form>
  )
}

/** Телефон, которого нет в товарах: модель, IMEI1, IMEI2, серийный номер */
function ManualPhone({
  row,
  index,
  error,
  onChange,
}: {
  row: Row
  index: number
  error: (i: number, field: string) => string | undefined
  onChange: (patch: Partial<Row>) => void
}) {
  const id = (f: string) => `row-${row.key}-${f}`
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <FormField label="Модель" htmlFor={id("model")} required error={error(index, "phoneModel")}>
        <div className="flex gap-2">
          <Input
            id={id("model")}
            placeholder="iPhone 15 Pro"
            value={row.phoneModel}
            onChange={(e) => onChange({ phoneModel: e.target.value })}
          />
          <ScanButton
            mode="box"
            label={null}
            onResult={([i1, i2, sn]) =>
              onChange({
                ...(i1 && { imei1: i1 }),
                ...(i2 && { imei2: i2 }),
                ...(sn && { serialNumber: sn }),
              })
            }
          />
        </div>
      </FormField>
      <FormField label="Серийный номер" htmlFor={id("sn")} required error={error(index, "serialNumber")}>
        <Input
          id={id("sn")}
          className="font-mono uppercase"
          value={row.serialNumber}
          onChange={(e) => onChange({ serialNumber: e.target.value })}
        />
      </FormField>
      <FormField label="IMEI1" htmlFor={id("imei1")} required error={error(index, "imei1")} warning={imeiWarning(row.imei1)}>
        <Input
          id={id("imei1")}
          inputMode="numeric"
          className="font-mono"
          value={row.imei1}
          onChange={(e) => onChange({ imei1: e.target.value })}
        />
      </FormField>
      <FormField label="IMEI2" htmlFor={id("imei2")} required error={error(index, "imei2")} warning={imeiWarning(row.imei2)}>
        <Input
          id={id("imei2")}
          inputMode="numeric"
          className="font-mono"
          value={row.imei2}
          onChange={(e) => onChange({ imei2: e.target.value })}
        />
      </FormField>
    </div>
  )
}

function Info({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="break-words">{value || "—"}</div>
    </div>
  )
}
