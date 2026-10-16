"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import {
  BanIcon,
  CheckCircle2Icon,
  CopyIcon,
  KeyRoundIcon,
  MoreHorizontalIcon,
  RefreshCwIcon,
  Trash2Icon,
  UnlockIcon,
  UserPlusIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { FormField } from "@/components/form-field"
import { NativeSelect } from "@/components/native-select"
import { createUserSchema, generatePassword, type CreateUserInput } from "@/lib/validators/user"
import {
  approveUserAction,
  rejectUserAction,
  createUserAction,
  deleteUserAction,
  resetUserPasswordAction,
  setUserActiveAction,
} from "@/server/actions/users"

/** Карточка с логином и паролем, которые можно скопировать и отправить человеку */
function Credentials({ login, password }: { login: string; password: string }) {
  const url = typeof window !== "undefined" ? window.location.origin : ""
  const text = `Доступ в CRM «Учёт телефонов»\nСайт: ${url}\nЛогин: ${login}\nПароль: ${password}`
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl border bg-muted/40 p-4">
        <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <span className="text-muted-foreground">Сайт</span>
          <span className="truncate font-medium">{url}</span>
          <span className="text-muted-foreground">Логин</span>
          <span className="font-mono text-base font-semibold">{login}</span>
          <span className="text-muted-foreground">Пароль</span>
          <span className="font-mono text-base font-semibold tracking-wider">{password}</span>
        </div>
      </div>
      <Button
        size="lg"
        onClick={async () => {
          await navigator.clipboard.writeText(text)
          toast.success("Скопировано — отправьте человеку в WhatsApp или Telegram")
        }}
      >
        <CopyIcon /> Скопировать для отправки
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        Пароль больше нигде не показывается. При первом входе человек заполнит компанию, имя и телефон.
      </p>
    </div>
  )
}

export function CreateUserButton() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [created, setCreated] = useState<{ login: string; password: string } | null>(null)
  const form = useForm<CreateUserInput>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { login: "", password: "", role: "USER" },
  })
  const { errors, isSubmitting } = form.formState

  function openDialog() {
    setCreated(null)
    form.reset({ login: "", password: generatePassword(), role: "USER" })
    setOpen(true)
  }

  async function onSubmit(values: CreateUserInput) {
    const r = await createUserAction(values)
    if (!r.ok) {
      for (const [k, v] of Object.entries(r.fieldErrors ?? {})) form.setError(k as keyof CreateUserInput, { message: v })
      toast.error(r.error)
      return
    }
    setCreated({ login: r.data.login, password: values.password })
    router.refresh()
  }

  return (
    <>
      <Button onClick={openDialog}>
        <UserPlusIcon /> Новый пользователь
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          {created ? (
            <>
              <DialogHeader className="items-center text-center">
                <span className="mb-1 flex size-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                  <CheckCircle2Icon className="size-6" />
                </span>
                <DialogTitle>Пользователь создан</DialogTitle>
                <DialogDescription>Отправьте эти данные человеку</DialogDescription>
              </DialogHeader>
              <Credentials {...created} />
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Новый пользователь</DialogTitle>
                <DialogDescription>
                  У каждого свои данные. Верификатор видит только телефоны, которые ему передали, и свои.
                </DialogDescription>
              </DialogHeader>
              <form id="create-user" onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
                <FormField label="Логин" htmlFor="new-login" required error={errors.login?.message} hint="Латиница и цифры, например aidar">
                  <Input id="new-login" autoCapitalize="none" autoComplete="off" autoFocus {...form.register("login")} />
                </FormField>
                <FormField label="Пароль" htmlFor="new-password" required error={errors.password?.message}>
                  <div className="flex gap-2">
                    <Input id="new-password" className="font-mono" autoComplete="off" {...form.register("password")} />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      title="Сгенерировать"
                      onClick={() => form.setValue("password", generatePassword(), { shouldValidate: true })}
                    >
                      <RefreshCwIcon />
                    </Button>
                  </div>
                </FormField>
                <FormField label="Роль" htmlFor="new-role">
                  <NativeSelect id="new-role" {...form.register("role")}>
                    <option value="USER">Компания (магазин)</option>
                    <option value="VERIFIER">Верификатор (получает телефоны от компаний)</option>
                    <option value="ADMIN">Администратор (может создавать пользователей)</option>
                  </NativeSelect>
                </FormField>
              </form>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Отмена
                </Button>
                <Button type="submit" form="create-user" disabled={isSubmitting}>
                  {isSubmitting ? "Создание…" : "Создать"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

export function UserActions({
  user,
  isSelf,
}: {
  user: { id: string; login: string; isActive: boolean }
  isSelf: boolean
}) {
  const router = useRouter()
  const [resetOpen, setResetOpen] = useState(false)
  const [blockOpen, setBlockOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [newPassword, setNewPassword] = useState("")
  const [done, setDone] = useState(false)
  const [pending, startTransition] = useTransition()

  function openReset() {
    setNewPassword(generatePassword())
    setDone(false)
    setResetOpen(true)
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button size="icon-sm" variant="ghost" aria-label="Действия" />}>
          <MoreHorizontalIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onClick={openReset}>
            <KeyRoundIcon /> Сбросить пароль
          </DropdownMenuItem>
          {!isSelf && (
            <>
              <DropdownMenuItem onClick={() => setBlockOpen(true)}>
                {user.isActive ? (
                  <>
                    <BanIcon /> Заблокировать
                  </>
                ) : (
                  <>
                    <UnlockIcon /> Разблокировать
                  </>
                )}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
                <Trash2Icon /> Удалить
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{done ? "Пароль изменён" : `Новый пароль для ${user.login}`}</DialogTitle>
            <DialogDescription>
              {done ? "Отправьте новые данные человеку" : "Человека выкинет со всех устройств, войти можно будет только с новым паролем."}
            </DialogDescription>
          </DialogHeader>
          {done ? (
            <Credentials login={user.login} password={newPassword} />
          ) : (
            <>
              <div className="flex gap-2">
                <Input value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="font-mono" />
                <Button variant="outline" size="icon" title="Сгенерировать" onClick={() => setNewPassword(generatePassword())}>
                  <RefreshCwIcon />
                </Button>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setResetOpen(false)}>
                  Отмена
                </Button>
                <Button
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const r = await resetUserPasswordAction(user.id, newPassword)
                      if (!r.ok) return void toast.error(r.error)
                      setDone(true)
                    })
                  }
                >
                  Сменить пароль
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={blockOpen}
        onOpenChange={setBlockOpen}
        title={user.isActive ? `Заблокировать ${user.login}?` : `Разблокировать ${user.login}?`}
        description={
          user.isActive
            ? "Человек сразу потеряет доступ. Его данные сохранятся — доступ можно вернуть в любой момент."
            : "Человек снова сможет войти со своим паролем."
        }
        confirmLabel={user.isActive ? "Заблокировать" : "Разблокировать"}
        destructive={user.isActive}
        onConfirm={async () => {
          const r = await setUserActiveAction(user.id, !user.isActive)
          if (!r.ok) {
            toast.error(r.error)
            return false
          }
          toast.success(user.isActive ? "Заблокирован" : "Разблокирован")
          router.refresh()
        }}
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Удалить ${user.login}?`}
        description="Удалить можно только пользователя без данных. Если у него есть телефоны или верификации — заблокируйте его."
        confirmLabel="Удалить"
        destructive
        onConfirm={async () => {
          const r = await deleteUserAction(user.id)
          if (!r.ok) {
            toast.error(r.error)
            return false
          }
          toast.success("Пользователь удалён")
          router.refresh()
        }}
      />
    </>
  )
}

/** Кнопки «Одобрить» / «Отклонить» для заявки верификатора */
export function PendingActions({ id, name }: { id: string; name: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [rejectOpen, setRejectOpen] = useState(false)
  return (
    <div className="grid grid-cols-2 gap-2">
      <Button
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await approveUserAction(id)
            if (!r.ok) return void toast.error(r.error)
            toast.success(`${name} одобрен — теперь может войти`)
            router.refresh()
          })
        }
      >
        <CheckCircle2Icon /> Одобрить
      </Button>
      <Button variant="outline" disabled={pending} onClick={() => setRejectOpen(true)}>
        Отклонить
      </Button>
      <ConfirmDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        title={`Отклонить заявку ${name}?`}
        description="Заявка будет удалена. Человек сможет зарегистрироваться заново."
        confirmLabel="Отклонить"
        destructive
        onConfirm={async () => {
          const r = await rejectUserAction(id)
          if (!r.ok) {
            toast.error(r.error)
            return false
          }
          toast.success("Заявка отклонена")
          router.refresh()
        }}
      />
    </div>
  )
}
