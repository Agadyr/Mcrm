"use client"

import { useRouter } from "next/navigation"
import { ScanButton } from "@/components/barcode-scanner"

/** Отсканировать IMEI/серийник и сразу найти */
export function SearchScan() {
  const router = useRouter()
  return (
    <ScanButton
      mode="any"
      label={null}
      onResult={([v]) => router.push(`/search?q=${encodeURIComponent(v)}`)}
    />
  )
}
