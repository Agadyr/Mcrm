"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  ArrowUpDownIcon,
  CameraIcon,
  CheckIcon,
  FlashlightIcon,
  ImageIcon,
  Loader2Icon,
  ScanBarcodeIcon,
  XIcon,
} from "lucide-react"
import type { ReaderOptions } from "zxing-wasm/reader"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { BoxCollector, extractImei, extractSerial, type Detected } from "@/lib/barcode"
import { cn } from "@/lib/utils"

// Сканер штрихкодов камерой. Распознаёт сама страница движком ZXing (C++, скомпилированный в WebAssembly),
// поэтому работает везде, где браузер даёт камеру: Safari и Chrome на iPhone (iOS 14.3+), Android, компьютер.
// Камера доступна только по https:// (или на localhost). Запасной вариант — сфотографировать наклейку.

export type ScanMode =
  | "box" // наклейка коробки: IMEI1, IMEI2 и серийный номер за один раз
  | "imei" // один IMEI
  | "serial" // серийный номер
  | "any" // для поиска: IMEI, серийник или любой код

/** Результат: для box — [IMEI1, IMEI2, S/N] (пустая строка, если не найдено), иначе одно значение */
export type ScanResult = string[]

const HINT: Record<ScanMode, string> = {
  box: "Наведите на наклейку с IMEI — найдём IMEI1, IMEI2 и серийный номер",
  imei: "Наведите на штрихкод IMEI",
  serial: "Наведите на штрихкод серийного номера (S/N)",
  any: "Наведите на штрихкод IMEI или серийного номера",
}

const READER_OPTIONS: ReaderOptions = {
  formats: ["Code128", "Code39", "EAN13", "QRCode", "DataMatrix"], // IMEI и S/N на коробках — Code 128
  tryHarder: true,
  tryRotate: true,
  tryInvert: false,
  tryDownscale: true,
  maxNumberOfSymbols: 10, // на наклейке много штрихкодов — читаем все сразу
}

/** Движок загружается один раз, при первом открытии сканера (файл ~1 МБ лежит на нашем сайте) */
let enginePromise: Promise<typeof import("zxing-wasm/reader")> | null = null
function loadEngine() {
  enginePromise ??= import("zxing-wasm/reader").then(async (zx) => {
    await zx.prepareZXingModule({
      overrides: {
        locateFile: (path: string, prefix: string) =>
          path.endsWith(".wasm") ? `/zxing_reader.wasm?v=${zx.ZXING_WASM_VERSION}` : prefix + path,
      },
      fireImmediately: true,
    })
    return zx
  })
  enginePromise.catch(() => (enginePromise = null))
  return enginePromise
}

type Frame = { data: ImageData; width: number; height: number }

/** Картинка → ImageData: вырезаем область crop и масштабируем так, чтобы длинная сторона была ≈ side */
function grab(source: CanvasImageSource, w: number, h: number, side: number, crop?: { x: number; y: number; w: number; h: number }): Frame {
  const c = crop ?? { x: 0, y: 0, w, h }
  const scale = side / Math.max(c.w, c.h)
  const canvas = document.createElement("canvas")
  canvas.width = Math.round(c.w * scale)
  canvas.height = Math.round(c.h * scale)
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!
  ctx.imageSmoothingQuality = "high"
  ctx.drawImage(source, c.x, c.y, c.w, c.h, 0, 0, canvas.width, canvas.height)
  return { data: ctx.getImageData(0, 0, canvas.width, canvas.height), width: canvas.width, height: canvas.height }
}

/** Прочитать все штрихкоды на кадре */
async function decode(frame: Frame): Promise<Detected[]> {
  const zx = await loadEngine()
  const results = await zx.readBarcodes(frame.data, READER_OPTIONS)
  return results
    .filter((r) => r.isValid && r.text)
    .map((r) => {
      const p = r.position
      return {
        text: r.text,
        cx: (p.topLeft.x + p.topRight.x + p.bottomLeft.x + p.bottomRight.x) / 4,
        cy: (p.topLeft.y + p.topRight.y + p.bottomLeft.y + p.bottomRight.y) / 4,
        orientation: r.orientation,
      }
    })
}

export function BarcodeScanner({
  open,
  onOpenChange,
  mode,
  onResult,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: ScanMode
  onResult: (values: ScanResult) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const runningRef = useRef(false)
  const boxRef = useRef(new BoxCollector())
  const [box, setBox] = useState<{ imeis: string[]; serial: string | null }>({ imeis: [], serial: null })
  const [review, setReview] = useState(false) // всё нашли — показываем, что заполним
  const [status, setStatus] = useState<"starting" | "scanning" | "error">("starting")
  const [error, setError] = useState<string | null>(null)
  const [torch, setTorch] = useState<boolean | null>(null) // null — фонарик недоступен
  const [photoBusy, setPhotoBusy] = useState(false)
  // свежие колбэки без перезапуска камеры при каждом рендере формы
  const onResultRef = useRef(onResult)
  const onOpenChangeRef = useRef(onOpenChange)
  useEffect(() => {
    onResultRef.current = onResult
    onOpenChangeRef.current = onOpenChange
  })

  const stop = useCallback(() => {
    runningRef.current = false
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  const finish = useCallback(
    (values: ScanResult) => {
      stop()
      navigator.vibrate?.(80)
      onResultRef.current(values)
      onOpenChangeRef.current(false)
    },
    [stop]
  )

  const syncBox = useCallback(() => setBox({ imeis: boxRef.current.ordered(), serial: boxRef.current.serial }), [])

  /** Штрихкоды одного кадра или фото; возвращает true, если что-то подошло */
  const accept = useCallback(
    (found: Detected[], width: number, height: number): boolean => {
      if (mode === "box") {
        const changed = boxRef.current.add(found, width, height, true)
        if (changed) {
          syncBox()
          navigator.vibrate?.(30)
        }
        const b = boxRef.current
        // нашли всё — останавливаем камеру и показываем результат на проверку
        if (b.imeis.length >= 2 && b.serial) {
          stop()
          setReview(true)
        }
        return changed
      }
      for (const d of found) {
        const value =
          mode === "imei"
            ? extractImei(d.text)
            : mode === "serial"
              ? extractSerial(d.text)
              : (extractImei(d.text) ?? extractSerial(d.text) ?? (d.text.trim() || null))
        if (value) {
          finish([value])
          return true
        }
      }
      return false
    },
    [finish, mode, stop, syncBox]
  )

  // Запуск камеры и цикла распознавания при открытии
  useEffect(() => {
    if (!open) return
    boxRef.current = new BoxCollector()
    setBox({ imeis: [], serial: null })
    setReview(false)
    setError(null)
    setTorch(null)
    setStatus("starting")
    let cancelled = false
    void loadEngine() // грузим движок параллельно с камерой

    ;(async () => {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setStatus("error")
        setError("Камера доступна только по защищённому адресу (https). Сфотографируйте наклейку кнопкой ниже.")
        return
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        const track = stream.getVideoTracks()[0]
        // непрерывная автофокусировка, где поддерживается
        await track.applyConstraints({ advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet] }).catch(() => {})
        const caps = (track.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { torch?: boolean }
        setTorch(caps.torch ? false : null)

        for (let i = 0; i < 20 && !videoRef.current; i++) await new Promise((r) => setTimeout(r, 50))
        const video = videoRef.current
        if (!video || cancelled) return
        video.srcObject = stream
        await video.play().catch(() => {})
        setStatus("scanning")

        // Цикл по кругу: весь кадр → центральная полоса → она же увеличенная в 2 раза (для мелких штрихкодов)
        runningRef.current = true
        let tick = 0
        while (runningRef.current && !cancelled) {
          const w = video.videoWidth
          const h = video.videoHeight
          if (w && h) {
            const band =
              w >= h
                ? { x: Math.round(w * 0.04), y: Math.round(h * 0.2), w: Math.round(w * 0.92), h: Math.round(h * 0.6) }
                : { x: 0, y: Math.round(h * 0.25), w, h: Math.round(h * 0.5) }
            const pass = tick++ % 3
            const frame =
              pass === 0
                ? grab(video, w, h, Math.min(1920, Math.max(w, h)))
                : grab(video, w, h, pass === 1 ? Math.max(band.w, band.h) : Math.min(3200, Math.max(band.w, band.h) * 2), band)
            try {
              const found = await decode(frame)
              if (runningRef.current) accept(found, frame.width, frame.height)
            } catch (e) {
              console.error("[scanner]", e)
            }
          }
          await new Promise((r) => setTimeout(r, 80))
        }
      } catch (e) {
        if (cancelled) return
        const name = (e as { name?: string })?.name
        setStatus("error")
        setError(
          name === "NotAllowedError"
            ? "Нет доступа к камере. Разрешите камеру для сайта (на iPhone: Настройки → Safari → Камера) или сфотографируйте наклейку."
            : name === "NotFoundError"
              ? "Камера не найдена. Сфотографируйте наклейку кнопкой ниже."
              : "Не удалось включить камеру. Сфотографируйте наклейку кнопкой ниже."
        )
      }
    })()

    return () => {
      cancelled = true
      stop()
    }
  }, [open, accept, stop])

  /** Фото наклейки: пробуем в нескольких масштабах, мелкие штрихкоды — увеличенными */
  async function onPhoto(file: File | undefined) {
    if (!file) return
    setPhotoBusy(true)
    setError(null)
    const url = URL.createObjectURL(file)
    try {
      const img = new Image()
      img.src = url
      await img.decode() // браузер сам поворачивает фото по EXIF и понимает HEIC на iPhone
      const long = Math.max(img.naturalWidth, img.naturalHeight)
      // большое фото с iPhone — уменьшаем; маленькое (скриншот, обрезка) — увеличиваем в 2–4 раза:
      // мелкие штрихкоды после увеличения читаются заметно лучше
      const sides = [
        ...new Set(
          [Math.min(long, 2400), Math.min(long, 3600), long * 2, long * 2.5, long * 3, long * 4]
            .map((v) => Math.round(Math.min(v, 4000)))
            .filter((v) => v >= Math.min(long, 2400))
        ),
      ]
      let any = false
      let useful = false
      for (const side of sides) {
        const frame = grab(img, img.naturalWidth, img.naturalHeight, side)
        const found = await decode(frame)
        any ||= found.length > 0
        useful = accept(found, frame.width, frame.height) || useful
        const b = boxRef.current
        if (mode !== "box" ? useful : b.imeis.length >= 2 && b.serial) break
      }
      if (mode === "box" && boxRef.current.imeis.length > 0) {
        stop()
        setReview(true) // показываем, что нашли (даже если не всё)
      } else if (!useful) {
        setError(
          any
            ? "На фото нет подходящего штрихкода. Снимите наклейку с IMEI целиком."
            : "Не получилось распознать. Снимите наклейку ближе, ровно и без бликов."
        )
      }
    } catch (e) {
      console.error("[scanner]", e)
      setError("Не получилось открыть фото. Попробуйте ещё раз.")
    } finally {
      URL.revokeObjectURL(url)
      setPhotoBusy(false)
    }
  }

  const [imei1, imei2] = box.imeis

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) stop()
        onOpenChange(o)
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="flex h-dvh max-h-dvh w-full max-w-none flex-col gap-0 overflow-hidden rounded-none bg-black p-0 text-white ring-0 sm:h-auto sm:max-h-[90dvh] sm:max-w-lg sm:rounded-2xl"
      >
        <div className="flex items-center justify-between gap-2 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3">
          <DialogTitle className="flex items-center gap-2 text-base text-white">
            <ScanBarcodeIcon className="size-5" /> {review ? "Проверьте" : "Сканирование"}
          </DialogTitle>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Закрыть"
            className="flex size-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
          >
            <XIcon className="size-5" />
          </button>
        </div>

        {review ? (
          /* ── Результат: что заполним ── */
          <div className="flex flex-1 flex-col justify-center gap-3 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <Field label="IMEI1" value={imei1} />
            <div className="flex justify-center">
              <button
                type="button"
                disabled={!imei2}
                onClick={() => {
                  boxRef.current.swap()
                  syncBox()
                }}
                className="inline-flex h-9 items-center gap-2 rounded-full bg-white/10 px-4 text-sm hover:bg-white/20 disabled:opacity-40"
              >
                <ArrowUpDownIcon className="size-4" /> Поменять IMEI1 и IMEI2
              </button>
            </div>
            <Field label="IMEI2" value={imei2} />
            <Field label="Серийный номер" value={box.serial} />
            <p className="text-center text-xs text-white/60">
              Сверьте с наклейкой: IMEI1 обычно подписан «IMEI» или «IMEI/MEID», второй — «IMEI2».
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="inline-flex h-12 items-center justify-center rounded-xl bg-white/10 text-sm font-medium hover:bg-white/20"
              >
                Отмена
              </button>
              <Button
                size="lg"
                className="h-12 bg-emerald-600 text-base hover:bg-emerald-600/90"
                onClick={() => finish([imei1 ?? "", imei2 ?? "", box.serial ?? ""])}
              >
                <CheckIcon /> Заполнить
              </Button>
            </div>
          </div>
        ) : (
          <>
            {/* Видео с рамкой */}
            <div className="relative min-h-0 flex-1 bg-black sm:aspect-3/4 sm:flex-none">
              <video ref={videoRef} playsInline muted className="absolute inset-0 size-full object-cover" />
              {status === "starting" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-white/80">
                  <Loader2Icon className="size-6 animate-spin" /> Включаем камеру…
                </div>
              )}
              {status === "scanning" && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div
                    className={cn(
                      "relative w-[88%] rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.45)] ring-2 ring-white/90",
                      mode === "box" ? "h-[45%] max-h-72" : "h-28"
                    )}
                  >
                    <div className="absolute inset-x-3 top-1/2 h-0.5 animate-pulse bg-red-500/90" />
                  </div>
                </div>
              )}
              {status === "error" && (
                <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-white/90">
                  <div className="flex flex-col items-center gap-3">
                    <CameraIcon className="size-8 text-white/60" />
                    {error}
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-3 bg-black px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <p className="text-center text-sm text-white/80">{HINT[mode]}</p>
              {status === "scanning" && error && <p className="text-center text-xs text-amber-300">{error}</p>}
              {mode === "box" && (
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  {[
                    ["IMEI1", imei1],
                    ["IMEI2", imei2],
                    ["S/N", box.serial],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className={cn("rounded-lg px-1 py-1.5", value ? "bg-emerald-500/25 text-emerald-200" : "bg-white/10 text-white/50")}
                    >
                      <div className="flex items-center justify-center gap-1 font-medium">
                        {value && <CheckIcon className="size-3.5" />}
                        {label}
                      </div>
                      <div className="truncate font-mono text-[10px]">{value ? `…${value.slice(-6)}` : "ищем"}</div>
                    </div>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <label
                  className={cn(
                    "inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-white/10 text-sm font-medium hover:bg-white/20",
                    photoBusy && "pointer-events-none opacity-60"
                  )}
                >
                  {photoBusy ? <Loader2Icon className="size-4 animate-spin" /> : <ImageIcon className="size-4" />}
                  Сфотографировать
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="sr-only"
                    onChange={(e) => {
                      void onPhoto(e.target.files?.[0])
                      e.target.value = ""
                    }}
                  />
                </label>
                {mode === "box" && box.imeis.length > 0 ? (
                  <Button
                    size="lg"
                    className="h-11 bg-emerald-600 hover:bg-emerald-600/90"
                    onClick={() => {
                      stop()
                      setReview(true)
                    }}
                  >
                    <CheckIcon /> Готово
                  </Button>
                ) : torch !== null ? (
                  <button
                    type="button"
                    onClick={async () => {
                      const track = streamRef.current?.getVideoTracks()[0]
                      await track?.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] }).catch(() => {})
                      setTorch(!torch)
                    }}
                    className={cn(
                      "inline-flex h-11 items-center justify-center gap-2 rounded-xl text-sm font-medium",
                      torch ? "bg-amber-400 text-black" : "bg-white/10 hover:bg-white/20"
                    )}
                  >
                    <FlashlightIcon className="size-4" /> Фонарик
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onOpenChange(false)}
                    className="inline-flex h-11 items-center justify-center rounded-xl bg-white/10 text-sm font-medium hover:bg-white/20"
                  >
                    Отмена
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className={cn("rounded-xl px-4 py-3", value ? "bg-white/10" : "bg-white/5")}>
      <div className="text-xs text-white/60">{label}</div>
      <div className={cn("font-mono text-xl tracking-wide", value ? "text-white" : "text-white/40")}>{value || "не найден"}</div>
    </div>
  )
}

/** Кнопка «Сканировать» + окно сканера */
export function ScanButton({
  mode,
  onResult,
  label = "Сканировать",
  className,
  variant = "outline",
}: {
  mode: ScanMode
  onResult: (values: ScanResult) => void
  label?: string | null
  className?: string
  variant?: "outline" | "secondary" | "ghost"
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={label ? "default" : "icon"}
        className={className}
        onClick={() => setOpen(true)}
        title="Сканировать штрихкод камерой"
        // у кнопки-иконки нет текста — даём подпись для экранного диктора; у кнопки с текстом подпись — сам текст
        aria-label={label ? undefined : "Сканировать штрихкод камерой"}
      >
        <ScanBarcodeIcon />
        {label}
      </Button>
      <BarcodeScanner open={open} onOpenChange={setOpen} mode={mode} onResult={onResult} />
    </>
  )
}
