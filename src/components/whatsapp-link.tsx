import { MessageCircleIcon } from "lucide-react"
import { waLink } from "@/lib/whatsapp"
import { cn } from "@/lib/utils"

/** Кнопка «написать в WhatsApp» с готовым текстом. Ничего не показывает, если номера нет. */
export function WhatsAppLink({
  phone,
  text,
  label,
  className,
}: {
  phone: string | null | undefined
  text?: string
  /** подпись рядом с иконкой; без неё — только иконка */
  label?: string
  className?: string
}) {
  const href = waLink(phone, text)
  if (!href) return null
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title="Написать в WhatsApp"
      aria-label="Написать в WhatsApp"
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-50",
        label ? "h-7 bg-emerald-50 px-2.5" : "size-7 justify-center",
        className
      )}
    >
      <MessageCircleIcon className="size-4" />
      {label}
    </a>
  )
}
