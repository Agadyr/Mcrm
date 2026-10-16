"use client"

import { useState } from "react"
import Link from "next/link"
import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { BanknoteIcon, MoreHorizontalIcon, PencilIcon, SearchCheckIcon, Trash2Icon, Undo2Icon } from "lucide-react"
import type { PhoneStatus } from "@prisma/client"
import { Button, buttonVariants } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { useOpenedOnce } from "@/lib/use-opened-once"
import { cancelSaleAction, deletePhoneAction } from "@/server/actions/phones"
import { RfsCheckDialog, type RfsTarget } from "@/components/rfs-check-dialog"

// форма продажи (react-hook-form + zod) нужна только по нажатию «Продать» — её код грузится тогда же
const SellDialog = dynamic(() => import("./sell-dialog").then((m) => m.SellDialog), { ssr: false })

/** Почему у проданного телефона недоступно «Удалить» */
const SOLD_DELETE_HINT = "Продан — сначала отмените продажу"

export type PhoneActionsTarget = {
  id: string
  title: string
  status: PhoneStatus
  purchasePrice: number
  /** если передано — в меню появится «Проверить в РФС» */
  rfs?: RfsTarget
}

/** Отдельная кнопка «Продать» — в таблице товаров стоит в колонке «Продажа» */
export function SellButton({ phone, className }: { phone: PhoneActionsTarget; className?: string }) {
  const [open, setOpen] = useState(false)
  const opened = useOpenedOnce(open)
  return (
    <>
      <Button size="sm" variant="secondary" className={className} onClick={() => setOpen(true)}>
        <BanknoteIcon /> Продать
      </Button>
      {opened && <SellDialog phone={{ ...phone, onVerification: phone.status === "ON_VERIFICATION" }} open={open} onOpenChange={setOpen} />}
    </>
  )
}

/** Кнопки действий с телефоном: «Продать», редактировать, отменить продажу, удалить.
 *  hideSell — «Продать» показан отдельно (SellButton), здесь только меню «…» */
export function PhoneActions({
  phone,
  variant = "compact",
  afterDelete,
  hideSell,
}: {
  phone: PhoneActionsTarget
  variant?: "compact" | "full"
  afterDelete?: string
  hideSell?: boolean
}) {
  const router = useRouter()
  const [sellOpen, setSellOpen] = useState(false)
  const sellOpened = useOpenedOnce(sellOpen)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuOpened = useOpenedOnce(menuOpen)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [rfsOpen, setRfsOpen] = useState(false)
  const sold = phone.status === "SOLD"

  async function cancelSale() {
    const r = await cancelSaleAction(phone.id)
    if (!r.ok) {
      toast.error(r.error)
      return false
    }
    toast.success("Продажа отменена, телефон снова в наличии")
    router.refresh()
  }

  async function remove() {
    const r = await deletePhoneAction(phone.id)
    if (!r.ok) {
      toast.error(r.error)
      return false
    }
    toast.success("Телефон удалён")
    if (afterDelete) router.push(afterDelete)
    router.refresh()
  }

  const dialogs = (
    <>
      {phone.rfs && <RfsCheckDialog target={phone.rfs} open={rfsOpen} onOpenChange={setRfsOpen} />}
      {sellOpened && <SellDialog phone={{ ...phone, onVerification: phone.status === "ON_VERIFICATION" }} open={sellOpen} onOpenChange={setSellOpen} />}
      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Отменить продажу?"
        description="Телефон вернётся в статус «В наличии». Запись о продаже останется в истории как отменённая."
        confirmLabel="Отменить продажу"
        onConfirm={cancelSale}
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Удалить телефон?"
        description={
          <>
            <b>{phone.title}</b> будет удалён вместе с историей и отменёнными продажами. Верификации останутся, но без связи с товаром. Это действие нельзя отменить.
          </>
        }
        confirmLabel="Удалить"
        destructive
        onConfirm={remove}
      />
    </>
  )

  if (variant === "full") {
    return (
      <div className="flex flex-wrap gap-2">
        {!sold ? (
          <Button onClick={() => setSellOpen(true)}>
            <BanknoteIcon /> Продать
          </Button>
        ) : (
          <Button variant="outline" onClick={() => setCancelOpen(true)}>
            <Undo2Icon /> Отменить продажу
          </Button>
        )}
        <Link href={`/phones/${phone.id}/edit`} className={buttonVariants({ variant: "outline" })}>
          <PencilIcon /> Редактировать
        </Link>
        {/* проданный не удаляем — иначе пропадут выручка и долг покупателя */}
        <Button variant="destructive" disabled={sold} title={sold ? SOLD_DELETE_HINT : undefined} onClick={() => setDeleteOpen(true)}>
          <Trash2Icon /> Удалить
        </Button>
        {sold && <p className="basis-full text-xs text-muted-foreground">{SOLD_DELETE_HINT}</p>}
        {dialogs}
      </div>
    )
  }

  return (
    <div className="flex items-center justify-end gap-1">
      {!sold && !hideSell && (
        <Button size="sm" variant="secondary" onClick={() => setSellOpen(true)}>
          <BanknoteIcon /> Продать
        </Button>
      )}
      {/* до первого нажатия — простая кнопка: меню в каждой из 50 строк заметно замедляет загрузку списка */}
      {!menuOpened ? (
        <Button size="icon-sm" variant="ghost" aria-label="Действия" onClick={() => setMenuOpen(true)}>
          <MoreHorizontalIcon />
        </Button>
      ) : (
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger aria-label="Действия" render={<Button size="icon-sm" variant="ghost" aria-label="Действия" />}>
            <MoreHorizontalIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => router.push(`/phones/${phone.id}/edit`)}>
              <PencilIcon /> Редактировать
            </DropdownMenuItem>
            {phone.rfs && (
              <DropdownMenuItem onClick={() => setRfsOpen(true)}>
                <SearchCheckIcon /> Проверить в РФС
              </DropdownMenuItem>
            )}
            {sold && (
              <DropdownMenuItem onClick={() => setCancelOpen(true)}>
                <Undo2Icon /> Отменить продажу
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" disabled={sold} onClick={() => setDeleteOpen(true)}>
              <Trash2Icon />
              {sold ? (
                <span className="flex flex-col">
                  Удалить
                  <span className="text-xs text-muted-foreground">{SOLD_DELETE_HINT}</span>
                </span>
              ) : (
                "Удалить"
              )}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {dialogs}
    </div>
  )
}
