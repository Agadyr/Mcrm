import Image from "next/image"
import { cn } from "@/lib/utils"

/** Значок Kaspi магазина — фирменный круг (public/kaspi-logo.png) */
export function KaspiMark({ className }: { className?: string }) {
  return <Image src="/kaspi-logo.png" alt="" width={256} height={256} aria-hidden className={cn("size-10 shrink-0 rounded-full", className)} />
}
