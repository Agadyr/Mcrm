"use client"

import { useEffect, useId, useRef, useState } from "react"
import { TableIcon, ChartColumnIcon } from "lucide-react"
import { formatMoney, formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"

// График по времени: линии, столбцы рядом или столбцы стопкой. Одна ось, тонкие метки, подсказка по наведению
// и с клавиатуры (стрелки), легенда при двух и более рядах и всегда доступный табличный вид тех же данных.

export type ChartSeries = { key: string; label: string; /** css-цвет, например var(--viz-1) */ color: string; values: number[] }
export type ChartBucket = { label: string; title: string }

type Props = {
  kind: "line" | "columns" | "stacked"
  buckets: ChartBucket[]
  series: ChartSeries[]
  unit: "money" | "count"
  /** подпись единиц для количества: «шт.», «чел.» */
  countSuffix?: string
  /** название графика для скринридера */
  title: string
}

const HEIGHT = 240
const M = { top: 12, right: 14, bottom: 28 }
const BAR_MAX = 24
const BAR_GAP = 2

function trim(n: number) {
  return String(Math.round(n * 10) / 10).replace(".", ",")
}

function axisLabel(v: number, unit: Props["unit"]) {
  const a = Math.abs(v)
  const sign = v < 0 ? "−" : ""
  if (unit === "count") return `${sign}${formatNumber(a)}`
  if (a >= 1e6) return `${sign}${trim(a / 1e6)} млн`
  if (a >= 1e3) return `${sign}${trim(a / 1e3)} тыс`
  return `${sign}${a}`
}

/** «Круглые» отметки оси: шаг 1, 2, 2.5, 5 × 10ⁿ; для штук — только целые */
function scale(lo: number, hi: number, unit: Props["unit"], target = 4) {
  const span = Math.max(hi - lo, unit === "count" ? 1 : 1)
  const raw = span / target
  const pow = 10 ** Math.floor(Math.log10(raw))
  const f = raw / pow
  let step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * pow
  if (unit === "count") step = Math.max(1, Math.ceil(step))
  const min = lo < 0 ? Math.floor(lo / step) * step : 0
  const max = Math.max(Math.ceil(hi / step) * step, min + step)
  const ticks: number[] = []
  for (let v = min; v <= max + step / 1000; v += step) ticks.push(Math.round(v * 1000) / 1000)
  return { min, max, ticks }
}

/** Прямоугольник со скруглением только сверху (основание ровное) */
function roundedTop(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h)
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`
}

export function TimeChart({ kind, buckets, series, unit, countSuffix = "шт.", title }: Props) {
  const wrap = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(640)
  const [active, setActive] = useState<number | null>(null)
  const [table, setTable] = useState(false)
  const gid = useId()

  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(260, Math.floor(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [table]) // при возврате из табличного вида блок графика создаётся заново

  const fmt = (v: number) => (unit === "money" ? formatMoney(v) : `${formatNumber(v)} ${countSuffix}`)
  const n = buckets.length
  const allZero = series.every((s) => s.values.every((v) => v === 0))

  // ── шкала
  const totals = buckets.map((_, i) => series.reduce((a, s) => a + s.values[i], 0))
  const hiRaw = kind === "stacked" ? Math.max(...totals, 0) : Math.max(...series.flatMap((s) => s.values), 0)
  const loRaw = kind === "line" ? Math.min(...series.flatMap((s) => s.values), 0) : 0
  const sc = scale(loRaw, hiRaw, unit)
  const labelW = Math.max(...sc.ticks.map((t) => axisLabel(t, unit).length)) * 6.6 + 14
  const ml = Math.round(labelW)
  const plotW = Math.max(width - ml - M.right, 40)
  const plotH = HEIGHT - M.top - M.bottom
  const y = (v: number) => M.top + ((sc.max - v) / (sc.max - sc.min)) * plotH
  const band = plotW / n
  const cx = (i: number) => ml + band * (i + 0.5)
  const every = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(plotW / 58))))

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const box = e.currentTarget.getBoundingClientRect()
    const i = Math.floor((e.clientX - box.left - ml) / band)
    setActive(i < 0 || i >= n ? null : i)
  }
  function onKey(e: React.KeyboardEvent) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return
    e.preventDefault()
    setActive((a) => Math.min(n - 1, Math.max(0, (a ?? (e.key === "ArrowRight" ? -1 : n)) + (e.key === "ArrowRight" ? 1 : -1))))
  }

  const sums = series.map((s) => s.values.reduce((a, v) => a + v, 0))

  return (
    <div>
      {series.length > 1 && (
        <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {series.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <span className={cn("inline-block", kind === "line" ? "h-0.5 w-3.5 rounded-full" : "size-2.5 rounded-[3px]")} style={{ background: s.color }} />
              {s.label}
            </li>
          ))}
        </ul>
      )}

      {table ? (
        <div className="max-h-72 overflow-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Период</th>
                {series.map((s) => (
                  <th key={s.key} className="px-3 py-2 text-right font-medium">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {buckets.map((b, i) => (
                <tr key={i}>
                  <td className="px-3 py-1.5 text-muted-foreground">{b.title}</td>
                  {series.map((s) => (
                    <td key={s.key} className={cn("px-3 py-1.5 text-right tabular-nums", s.values[i] === 0 && "text-muted-foreground/60")}>
                      {fmt(s.values[i])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot className="sticky bottom-0 border-t bg-muted font-medium">
              <tr>
                <td className="px-3 py-2">Итого</td>
                {sums.map((v, i) => (
                  <td key={i} className="px-3 py-2 text-right tabular-nums">
                    {fmt(v)}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <div ref={wrap} className="relative" style={{ height: allZero ? 112 : HEIGHT }}>
          {allZero ? (
            <div className="flex h-full items-center justify-center rounded-xl bg-muted/50 text-sm text-muted-foreground">
              За этот период данных нет
            </div>
          ) : (
            <>
              <svg
                width={width}
                height={HEIGHT}
                role="img"
                aria-label={title}
                tabIndex={0}
                className="block touch-pan-y rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                onPointerMove={onMove}
                onPointerLeave={() => setActive(null)}
                onFocus={() => setActive((a) => a ?? n - 1)}
                onBlur={() => setActive(null)}
                onKeyDown={onKey}
              >
                {/* сетка и подписи оси Y */}
                {sc.ticks.map((t) => (
                  <g key={t}>
                    <line x1={ml} x2={ml + plotW} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--viz-axis)" : "var(--viz-grid)"} strokeWidth={1} strokeDasharray={t === 0 ? undefined : "3 4"} />
                    <text x={ml - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize={11} fill="var(--muted-foreground)">
                      {axisLabel(t, unit)}
                    </text>
                  </g>
                ))}
                {/* подписи оси X — через несколько, чтобы не слипались */}
                {buckets.map((b, i) =>
                  i % every === 0 ? (
                    <text key={i} x={cx(i)} y={HEIGHT - 8} textAnchor="middle" fontSize={11} fill="var(--muted-foreground)">
                      {b.label}
                    </text>
                  ) : null
                )}

                {/* выбранный отрезок */}
                {active !== null && kind !== "line" && (
                  <rect x={ml + band * active} y={M.top} width={band} height={plotH} fill="var(--muted)" opacity={0.7} rx={6} />
                )}
                {active !== null && kind === "line" && (
                  <line x1={cx(active)} x2={cx(active)} y1={M.top} y2={M.top + plotH} stroke="var(--viz-axis)" strokeWidth={1} />
                )}

                {kind === "line" &&
                  series.map((s, si) => {
                    const pts = s.values.map((v, i) => `${cx(i)},${y(v)}`).join(" ")
                    const last = n - 1
                    return (
                      <g key={s.key}>
                        {/* лёгкая заливка под линией — только для первого ряда, чтобы не рябило */}
                        {si === 0 && (
                          <>
                            <defs>
                              <linearGradient id={`${gid}-${s.key}`} x1="0" x2="0" y1="0" y2="1">
                                <stop offset="0%" stopColor={s.color} stopOpacity={0.16} />
                                <stop offset="100%" stopColor={s.color} stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <polygon points={`${cx(0)},${y(0)} ${pts} ${cx(last)},${y(0)}`} fill={`url(#${gid}-${s.key})`} />
                          </>
                        )}
                        <polyline points={pts} fill="none" stroke={s.color} strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" />
                        {active === null ? (
                          <circle cx={cx(last)} cy={y(s.values[last])} r={4} fill={s.color} stroke="var(--card)" strokeWidth={2} />
                        ) : (
                          <circle cx={cx(active)} cy={y(s.values[active])} r={4} fill={s.color} stroke="var(--card)" strokeWidth={2} />
                        )}
                      </g>
                    )
                  })}

                {kind === "columns" &&
                  buckets.map((_, i) => {
                    const k = series.length
                    const w = Math.min(BAR_MAX, (band * 0.8 - BAR_GAP * (k - 1)) / k)
                    const x0 = cx(i) - (k * w + (k - 1) * BAR_GAP) / 2
                    return series.map((s, j) => {
                      const v = s.values[i]
                      if (v <= 0) return null
                      const h = Math.max(2, y(0) - y(v))
                      return <path key={`${i}-${s.key}`} d={roundedTop(x0 + j * (w + BAR_GAP), y(0) - h, w, h, 4)} fill={s.color} />
                    })
                  })}

                {kind === "stacked" &&
                  buckets.map((_, i) => {
                    const w = Math.min(BAR_MAX, band * 0.7)
                    const x0 = cx(i) - w / 2
                    const visible = series.filter((s) => s.values[i] > 0)
                    let acc = 0
                    return visible.map((s, j) => {
                      const v = s.values[i]
                      const yBottom = y(acc)
                      acc += v
                      const yTop = y(acc)
                      // зазор 2px между сегментами: верхний сегмент чуть короче снизу
                      const bottom = j === 0 ? yBottom : yBottom - BAR_GAP
                      const h = Math.max(1.5, bottom - yTop)
                      const top = j === visible.length - 1
                      return top ? (
                        <path key={`${i}-${s.key}`} d={roundedTop(x0, bottom - h, w, h, 4)} fill={s.color} />
                      ) : (
                        <rect key={`${i}-${s.key}`} x={x0} y={bottom - h} width={w} height={h} fill={s.color} />
                      )
                    })
                  })}
              </svg>

              {active !== null && (
                <div
                  role="status"
                  className="pointer-events-none absolute top-2 z-10 min-w-40 rounded-xl border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-lg"
                  style={active > n / 2 ? { left: cx(active) - 12, transform: "translateX(-100%)" } : { left: cx(active) + 12 }}
                >
                  <div className="mb-1.5 text-muted-foreground">{buckets[active].title}</div>
                  <ul className="flex flex-col gap-1">
                    {series.map((s) => (
                      <li key={s.key} className="flex items-center gap-2">
                        <span className="h-0.5 w-3 shrink-0 rounded-full" style={{ background: s.color }} />
                        <span className="text-muted-foreground">{s.label}</span>
                        <span className="ml-auto pl-3 font-semibold tabular-nums">{fmt(s.values[active])}</span>
                      </li>
                    ))}
                    {kind === "stacked" && (
                      <li className="mt-0.5 flex items-center gap-2 border-t pt-1.5">
                        <span className="text-muted-foreground">Всего</span>
                        <span className="ml-auto pl-3 font-semibold tabular-nums">{fmt(totals[active])}</span>
                      </li>
                    )}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => setTable((t) => !t)}
        aria-pressed={table}
        className="mt-3 -ml-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        {table ? <ChartColumnIcon className="size-3.5" /> : <TableIcon className="size-3.5" />}
        {table ? "Показать график" : "Показать таблицей"}
      </button>
    </div>
  )
}
