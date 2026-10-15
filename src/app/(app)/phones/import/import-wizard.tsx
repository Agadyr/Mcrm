"use client"

import { useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { CheckCircle2Icon, FileSpreadsheetIcon, Loader2Icon, UploadIcon } from "lucide-react"
import type { PhoneStatus } from "@prisma/client"
import { Button, buttonVariants } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { NativeSelect } from "@/components/native-select"
import { PhoneStatusBadge } from "@/components/status-badge"
import { formatMoney } from "@/lib/format"
import { guessMapping, IMPORT_FIELDS, type ImportMapping } from "@/lib/import-fields"
import { cn } from "@/lib/utils"
import {
  commitImportAction,
  parseImportFileAction,
  previewImportAction,
  type ImportReport,
} from "@/server/actions/import"
import type { ParsedSheet, RowCheck } from "@/server/import"

type PreviewRow = Omit<RowCheck, "phone" | "sale">
type Step = "upload" | "map" | "preview" | "done"

const STATE_LABEL: Record<PreviewRow["state"], string> = {
  ok: "Готово",
  warning: "Предупреждение",
  error: "Ошибка",
  duplicate: "Дубль",
}
const STATE_COLOR: Record<PreviewRow["state"], string> = {
  ok: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  warning: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  error: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
  duplicate: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
}

export function ImportWizard() {
  const [step, setStep] = useState<Step>("upload")
  const [pending, startTransition] = useTransition()
  const [fileName, setFileName] = useState("")
  const [sheets, setSheets] = useState<ParsedSheet[]>([])
  const [sheetIdx, setSheetIdx] = useState(0)
  const [mapping, setMapping] = useState<ImportMapping>({})
  const [preview, setPreview] = useState<PreviewRow[]>([])
  const [filter, setFilter] = useState<"all" | "problems">("all")
  const [report, setReport] = useState<ImportReport | null>(null)

  const sheet = sheets[sheetIdx]

  function onFile(file: File | undefined) {
    if (!file) return
    setFileName(file.name)
    const fd = new FormData()
    fd.set("file", file)
    startTransition(async () => {
      const r = await parseImportFileAction(fd)
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      setSheets(r.data)
      setSheetIdx(0)
      setMapping(guessMapping(r.data[0].headers))
      setStep("map")
    })
  }

  function payload() {
    return { rows: sheet.rows, rowNumbers: sheet.rowNumbers, mapping }
  }

  function runPreview() {
    startTransition(async () => {
      const r = await previewImportAction(payload())
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      setPreview(r.data)
      setFilter("all")
      setStep("preview")
    })
  }

  function runImport() {
    startTransition(async () => {
      const r = await commitImportAction(payload())
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      setReport(r.data)
      setStep("done")
      toast.success(`Импортировано: ${r.data.created}`)
    })
  }

  const counts = useMemo(() => {
    const c = { ok: 0, warning: 0, error: 0, duplicate: 0 }
    for (const r of preview) c[r.state]++
    return c
  }, [preview])
  const importable = counts.ok + counts.warning
  const shownRows = (filter === "all" ? preview : preview.filter((r) => r.state !== "ok")).slice(0, 500)

  return (
    <div className="flex flex-col gap-4">
      <Steps step={step} />

      {step === "upload" && (
        <label
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed bg-card p-10 text-center transition-colors hover:bg-muted/40",
            pending && "pointer-events-none opacity-60"
          )}
        >
          {pending ? <Loader2Icon className="size-8 animate-spin" /> : <FileSpreadsheetIcon className="size-8 text-muted-foreground" />}
          <div className="font-medium">{pending ? `Читаем ${fileName}…` : "Выберите файл .xlsx"}</div>
          <div className="text-sm text-muted-foreground">
            Первая строка с заголовками будет найдена автоматически. До 5000 строк.
          </div>
          <input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            onChange={(e) => onFile(e.target.files?.[0])}
          />
        </label>
      )}

      {step === "map" && sheet && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="font-medium">{fileName}</span>
            {sheets.length > 1 && (
              <NativeSelect
                className="w-56"
                value={sheetIdx}
                onChange={(e) => {
                  const i = Number(e.target.value)
                  setSheetIdx(i)
                  setMapping(guessMapping(sheets[i].headers))
                }}
              >
                {sheets.map((s, i) => (
                  <option key={i} value={i}>
                    Лист: {s.name} ({s.rows.length})
                  </option>
                ))}
              </NativeSelect>
            )}
            <span className="text-muted-foreground">Строк с данными: {sheet.rows.length}</span>
          </div>

          <div className="rounded-2xl border bg-card p-4 shadow-xs sm:p-5">
            <h2 className="mb-1 font-medium">Сопоставление колонок</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              Для каждого поля выберите колонку из файла. Обязательны «Модель» и «IMEI1». Если указана «Цена продажи»,
              телефон будет импортирован как проданный.
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {IMPORT_FIELDS.map((f) => {
                const idx = mapping[f.key]
                const sample = idx !== undefined ? sheet.rows.find((r) => r[idx])?.[idx] : undefined
                return (
                  <div key={f.key} className="flex flex-col gap-1">
                    <label className="text-sm font-medium">
                      {f.label}
                      {"required" in f && f.required && <span className="text-destructive">*</span>}
                    </label>
                    <NativeSelect
                      value={idx ?? ""}
                      onChange={(e) => {
                        const v = e.target.value
                        setMapping((m) => {
                          const next = { ...m }
                          if (v === "") delete next[f.key]
                          else next[f.key] = Number(v)
                          return next
                        })
                      }}
                    >
                      <option value="">— не импортировать —</option>
                      {sheet.headers.map((h, i) => (
                        <option key={i} value={i}>
                          {h || `Колонка ${i + 1}`}
                        </option>
                      ))}
                    </NativeSelect>
                    <span className="truncate text-xs text-muted-foreground">
                      {sample ? `напр.: ${sample}` : " "}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border bg-card shadow-xs">
            <div className="border-b px-3 py-2 text-sm font-medium">Первые строки файла</div>
            <Table>
              <TableHeader>
                <TableRow>
                  {sheet.headers.map((h, i) => (
                    <TableHead key={i}>{h || `Колонка ${i + 1}`}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sheet.rows.slice(0, 5).map((r, i) => (
                  <TableRow key={i}>
                    {sheet.headers.map((_, j) => (
                      <TableCell key={j} className="text-xs">
                        {r[j]}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex gap-2">
            <Button size="lg" onClick={runPreview} disabled={pending || mapping.model === undefined || mapping.imei1 === undefined}>
              {pending && <Loader2Icon className="animate-spin" />} Проверить
            </Button>
            <Button size="lg" variant="outline" onClick={() => setStep("upload")} disabled={pending}>
              Другой файл
            </Button>
          </div>
        </div>
      )}

      {step === "preview" && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(["ok", "warning", "duplicate", "error"] as const).map((s) => (
              <div key={s} className={cn("rounded-xl p-3", STATE_COLOR[s])}>
                <div className="text-xs">{STATE_LABEL[s]}</div>
                <div className="text-2xl font-semibold tabular-nums">{counts[s]}</div>
              </div>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            Будет импортировано: <b className="text-foreground">{importable}</b> (готовые + с предупреждениями). Дубли и
            строки с ошибками будут пропущены.
          </p>
          <div className="flex gap-2">
            <NativeSelect className="w-60" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
              <option value="all">Все строки ({preview.length})</option>
              <option value="problems">Только проблемы ({preview.length - counts.ok})</option>
            </NativeSelect>
          </div>
          <PreviewTable rows={shownRows} />
          {shownRows.length < (filter === "all" ? preview.length : preview.length - counts.ok) && (
            <p className="text-xs text-muted-foreground">Показаны первые 500 строк</p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button size="lg" onClick={runImport} disabled={pending || importable === 0}>
              {pending ? <Loader2Icon className="animate-spin" /> : <UploadIcon />} Импортировать {importable}
            </Button>
            <Button size="lg" variant="outline" onClick={() => setStep("map")} disabled={pending}>
              Назад к колонкам
            </Button>
          </div>
        </div>
      )}

      {step === "done" && report && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3 rounded-xl bg-emerald-50 p-4 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
            <CheckCircle2Icon className="size-6 shrink-0" />
            <div>
              <div className="font-medium">Импортировано телефонов: {report.created}</div>
              <div className="text-sm">Пропущено строк: {report.skipped.length}</div>
            </div>
          </div>
          {report.skipped.length > 0 && (
            <div className="overflow-hidden rounded-2xl border bg-card shadow-xs">
              <div className="border-b px-3 py-2 text-sm font-medium">Пропущенные строки</div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">Строка</TableHead>
                    <TableHead>Причина</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.skipped.slice(0, 1000).map((s) => (
                    <TableRow key={s.row}>
                      <TableCell className="tabular-nums">{s.row}</TableCell>
                      <TableCell className="whitespace-normal">{s.reason}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <div className="flex gap-2">
            <Link href="/phones" className={buttonVariants({ size: "lg" })}>
              К товарам
            </Link>
            <Button
              size="lg"
              variant="outline"
              onClick={() => {
                setStep("upload")
                setSheets([])
                setPreview([])
                setReport(null)
              }}
            >
              Импортировать ещё
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function PreviewTable({ rows }: { rows: PreviewRow[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border bg-card shadow-xs">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40">
            <TableHead className="w-16">Строка</TableHead>
            <TableHead>Результат</TableHead>
            <TableHead>Модель</TableHead>
            <TableHead>IMEI1 / IMEI2</TableHead>
            <TableHead className="text-right">Закупка</TableHead>
            <TableHead>Статус</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.row}>
              <TableCell className="align-top tabular-nums">{r.row}</TableCell>
              <TableCell className="max-w-80 align-top whitespace-normal">
                <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium", STATE_COLOR[r.state])}>
                  {STATE_LABEL[r.state]}
                </span>
                {r.messages.map((m, i) => (
                  <div key={i} className="mt-0.5 text-xs text-muted-foreground">
                    {m}
                  </div>
                ))}
              </TableCell>
              <TableCell className="align-top">{r.preview.model || "—"}</TableCell>
              <TableCell className="align-top font-mono text-xs">
                {r.preview.imei1 || "—"}
                {r.preview.imei2 && <div className="text-muted-foreground">{r.preview.imei2}</div>}
              </TableCell>
              <TableCell className="text-right align-top tabular-nums">
                {/^\d+$/.test(r.preview.purchasePrice) ? formatMoney(Number(r.preview.purchasePrice)) : r.preview.purchasePrice}
              </TableCell>
              <TableCell className="align-top">
                <PhoneStatusBadge status={r.preview.status as PhoneStatus} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function Steps({ step }: { step: Step }) {
  const steps: { key: Step; label: string }[] = [
    { key: "upload", label: "Файл" },
    { key: "map", label: "Колонки" },
    { key: "preview", label: "Проверка" },
    { key: "done", label: "Готово" },
  ]
  const current = steps.findIndex((s) => s.key === step)
  return (
    <ol className="flex items-center gap-2 text-sm">
      {steps.map((s, i) => (
        <li key={s.key} className="flex items-center gap-2">
          <span
            className={cn(
              "flex size-6 items-center justify-center rounded-full text-xs font-medium",
              i <= current ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            )}
          >
            {i + 1}
          </span>
          <span className={cn(i === current ? "font-medium" : "text-muted-foreground", "hidden sm:inline")}>{s.label}</span>
          {i < steps.length - 1 && <span className="text-muted-foreground">—</span>}
        </li>
      ))}
    </ol>
  )
}
