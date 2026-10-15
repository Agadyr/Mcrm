import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import {
  BanknoteIcon,
  HandCoinsIcon,
  ChevronLeftIcon,
  CircleDotIcon,
  PackagePlusIcon,
  PencilIcon,
  ShieldCheckIcon,
  Undo2Icon,
  SearchCheckIcon,
  UploadIcon,
} from "lucide-react"
import type { PhoneEventType } from "@prisma/client"
import { prisma } from "@/lib/db"
import { requireUser } from "@/lib/auth"
import { todayDate } from "@/lib/dates"
import { formatDate, formatDateTime, formatMemory, formatMoney, phoneTitle } from "@/lib/format"
import {
  ACTIVE_VERIFICATION_STATUSES,
  BLOCKING_VERIFICATION_STATUSES,
  PAYMENT_METHOD_LABEL,
  PHONE_CONDITION_LABEL,
  RFS_STATUS_LABEL,
} from "@/lib/labels"
import { CopyText } from "@/components/copy-text"
import { PageHeader } from "@/components/page-header"
import { PhoneStatusBadge, VerificationStatusBadge, VerifiedMark } from "@/components/status-badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { PhoneActions } from "../phone-actions"
import { RfsBadge, RfsCheckButton } from "@/components/rfs-check-dialog"
import { displayName, phoneAccessWhere } from "@/server/access"
import { WhatsAppLink } from "@/components/whatsapp-link"
import { phoneText } from "@/lib/whatsapp"

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const user = await requireUser()
  const phone = await prisma.phone.findFirst({
    where: { id, ...phoneAccessWhere(user.id) },
    select: { model: true },
  })
  return { title: phone?.model ?? "Телефон" }
}

const EVENT_ICON: Record<PhoneEventType, React.ComponentType<{ className?: string }>> = {
  CREATED: PackagePlusIcon,
  IMPORTED: UploadIcon,
  UPDATED: PencilIcon,
  STATUS_CHANGED: CircleDotIcon,
  SOLD: BanknoteIcon,
  SALE_CANCELLED: Undo2Icon,
  SALE_PAYMENT: HandCoinsIcon,
  VERIFICATION_CREATED: ShieldCheckIcon,
  VERIFICATION_UPDATED: ShieldCheckIcon,
  VERIFICATION_DELETED: ShieldCheckIcon,
  RFS_CHECK: SearchCheckIcon,
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b py-2 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  )
}

/** События, которые видит верификатор на телефоне компании (без цен и продаж) */
const AGENT_VISIBLE_EVENTS: PhoneEventType[] = [
  "STATUS_CHANGED",
  "VERIFICATION_CREATED",
  "VERIFICATION_UPDATED",
  "VERIFICATION_DELETED",
  "RFS_CHECK",
]

export default async function PhonePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await requireUser()
  // телефон виден владельцу и верификатору, которому его передали
  const phone = await prisma.phone.findFirst({
    where: { id, ...phoneAccessWhere(user.id) },
    include: {
      owner: {
        select: {
          id: true,
          name: true,
          login: true,
          companyName: true,
          phone: true,
        },
      },
      sales: { orderBy: { createdAt: "desc" } },
      verifications: {
        orderBy: { createdAt: "desc" },
        include: {
          verifier: true,
          agent: { select: { name: true, login: true, phone: true } },
        },
      },
      events: {
        orderBy: { createdAt: "desc" },
        include: { user: { select: { login: true, name: true } } },
      },
    },
  })
  if (!phone) notFound()

  const isOwner = phone.ownerId === user.id
  // верификатор видит только свою часть: свои верификации и события без цен;
  // компания не получает человека, которого нашёл верификатор
  const verifications = (isOwner ? phone.verifications : phone.verifications.filter((v) => v.agentId === user.id)).map((v) =>
    (v.agentId ?? v.ownerId) === user.id
      ? v
      : {
          ...v,
          verifier: null,
          country: null,
          payment: 0,
          isPaid: false,
          agentNote: null,
        }
  )
  const events = isOwner ? phone.events : phone.events.filter((e) => AGENT_VISIBLE_EVENTS.includes(e.type))
  const sale = isOwner ? phone.sales.find((s) => !s.cancelledAt) : undefined
  const activeVerification = verifications.find((v) => ACTIVE_VERIFICATION_STATUSES.includes(v.status))
  // на верификацию — только после продажи и если нет идущей или успешной верификации
  const canVerify = phone.status === "SOLD" && !verifications.some((v) => BLOCKING_VERIFICATION_STATUSES.includes(v.status))

  return (
    <>
      <PageHeader
        back={
          <Link href="/phones" className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
            <ChevronLeftIcon className="size-4" /> {user.role === "VERIFIER" ? "Телефоны" : "Товары"}
          </Link>
        }
        title={phone.model}
        description={
          <div className="flex flex-wrap items-center gap-1.5">
            {[formatMemory(phone.memoryGb), phone.color, PHONE_CONDITION_LABEL[phone.condition]].filter(Boolean).join(" · ")}
            <PhoneStatusBadge status={phone.status} />
            {phone.isVerified && <VerifiedMark />}
            {activeVerification && <VerificationStatusBadge status={activeVerification.status} />}
            <RfsBadge status={phone.rfsStatus} checkedAt={phone.rfsCheckedAt} />
          </div>
        }
        actions={
          <>
            <RfsCheckButton
              target={{
                phoneId: phone.id,
                title: phoneTitle(phone),
                imei1: phone.imei1,
                imei2: phone.imei2,
                rfsStatus: phone.rfsStatus,
                rfsCheckedAt: phone.rfsCheckedAt,
              }}
            />
            {isOwner ? (
              <PhoneActions
                variant="full"
                afterDelete="/phones"
                phone={{
                  id: phone.id,
                  title: phoneTitle(phone),
                  status: phone.status,
                  purchasePrice: phone.purchasePrice,
                }}
              />
            ) : (
              verifications[0] && (
                <Link href={`/verifications/${verifications[0].id}`} className={buttonVariants()}>
                  <ShieldCheckIcon /> Моя верификация
                </Link>
              )
            )}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Данные</CardTitle>
              </CardHeader>
              <CardContent>
                <Row label="IMEI1">
                  <CopyText value={phone.imei1} />
                </Row>
                <Row label="IMEI2">
                  <CopyText value={phone.imei2} />
                </Row>
                <Row label="Серийный номер">
                  <CopyText value={phone.serialNumber} />
                </Row>
                <Row label="Память">{formatMemory(phone.memoryGb) || "—"}</Row>
                <Row label="Цвет">{phone.color ?? "—"}</Row>
                <Row label="Состояние">{PHONE_CONDITION_LABEL[phone.condition]}</Row>
                <Row label="Проверка в РФС">
                  {phone.rfsStatus ? (
                    <>
                      <span className={phone.rfsStatus === "REGISTERED" ? "text-emerald-700" : "text-destructive"}>
                        {RFS_STATUS_LABEL[phone.rfsStatus]}
                      </span>
                      <span className="block text-xs text-muted-foreground">{formatDateTime(phone.rfsCheckedAt)}</span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">не проверялся</span>
                  )}
                </Row>
              </CardContent>
            </Card>
            {!isOwner ? (
              <Card>
                <CardHeader>
                  <CardTitle>От компании</CardTitle>
                </CardHeader>
                <CardContent>
                  <Row label="Компания">{phone.owner.companyName || displayName(phone.owner)}</Row>
                  <Row label="Контакт">{displayName(phone.owner)}</Row>
                  <Row label="Телефон">
                    {phone.owner.phone ? (
                      <span className="flex items-center justify-end gap-1">
                        <a href={`tel:${phone.owner.phone}`} className="hover:text-primary">
                          {phone.owner.phone}
                        </a>
                        <WhatsAppLink
                          phone={phone.owner.phone}
                          text={`Здравствуйте! По телефону на верификацию:\n${phoneText({ phoneModel: phone.model, imei1: phone.imei1, imei2: phone.imei2, serialNumber: phone.serialNumber })}`}
                        />
                      </span>
                    ) : (
                      "—"
                    )}
                  </Row>
                  {verifications[0] && (
                    <>
                      <Row label="Передан вам">{formatDate(verifications[0].handedAt)}</Row>
                      <Row label="Компания платит">
                        <span className="tabular-nums">{formatMoney(verifications[0].agentFee)}</span>
                        <span className={cn("block text-xs", verifications[0].agentPaid ? "text-emerald-700" : "text-amber-700")}>
                          {verifications[0].agentPaid ? "оплачено" : "не оплачено"}
                        </span>
                      </Row>
                    </>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>Закупка и продажа</CardTitle>
                </CardHeader>
                <CardContent>
                  <Row label="Цена закупки">
                    <span className="tabular-nums">{formatMoney(phone.purchasePrice)}</span>
                  </Row>
                  <Row label="Дата поступления">{formatDate(phone.receivedAt)}</Row>
                  <Row label="Поставщик">{phone.supplier ?? "—"}</Row>
                  {sale ? (
                    <>
                      <Row label="Цена продажи">
                        <span className="tabular-nums">{formatMoney(sale.salePrice)}</span>
                      </Row>
                      <Row label="Прибыль">
                        <span
                          className={cn(
                            "font-semibold tabular-nums",
                            sale.salePrice - phone.purchasePrice < 0
                              ? "text-destructive"
                              : "text-emerald-700 dark:text-emerald-400"
                          )}
                        >
                          {formatMoney(sale.salePrice - phone.purchasePrice)}
                        </span>
                      </Row>
                      <Row label="Дата продажи">{formatDate(sale.soldAt)}</Row>
                      <Row label="Оплата">{PAYMENT_METHOD_LABEL[sale.paymentMethod]}</Row>
                      {sale.paidAmount < sale.salePrice && (
                        <Row label="Долг покупателя">
                          <span className="font-semibold text-amber-700 tabular-nums dark:text-amber-400">
                            {formatMoney(sale.salePrice - sale.paidAmount)}
                          </span>
                          {sale.dueDate && (
                            <span
                              className={cn(
                                "block text-xs",
                                sale.dueDate < todayDate() ? "font-medium text-destructive" : "text-muted-foreground"
                              )}
                            >
                              вернёт до {formatDate(sale.dueDate)}
                            </span>
                          )}
                        </Row>
                      )}
                      <Row label="Покупатель">
                        {sale.buyerName ?? "—"}
                        {sale.buyerPhone && (
                          <span className="flex items-center justify-end gap-1">
                            <a href={`tel:${sale.buyerPhone}`} className="text-xs text-muted-foreground underline">
                              {sale.buyerPhone}
                            </a>
                            <WhatsAppLink
                              phone={sale.buyerPhone}
                              text={`Здравствуйте! Это ${phone.owner.companyName || "магазин"}, по вашему ${phone.model}.`}
                            />
                          </span>
                        )}
                      </Row>
                      {sale.note && <Row label="Заметка к продаже">{sale.note}</Row>}
                      <Link
                        href={`/sales/${sale.id}`}
                        className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-3 w-full")}
                      >
                        <HandCoinsIcon /> {sale.paidAmount < sale.salePrice ? "Принять оплату долга" : "Продажа и оплаты"}
                      </Link>
                    </>
                  ) : (
                    <Row label="Продажа">Не продан</Row>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {isOwner && phone.note && (
            <Card>
              <CardHeader>
                <CardTitle>Заметка</CardTitle>
              </CardHeader>
              <CardContent className="text-sm whitespace-pre-wrap">{phone.note}</CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Верификации</CardTitle>
              {isOwner && canVerify && (
                <Link
                  href={`/verifications/new?phoneId=${phone.id}`}
                  className={buttonVariants({ size: "sm", variant: "outline" })}
                >
                  <ShieldCheckIcon /> Отдать на верификацию
                </Link>
              )}
            </CardHeader>
            <CardContent>
              {verifications.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {phone.status === "SOLD" ? "Верификаций не было" : "На верификацию можно отдать после продажи"}
                </p>
              ) : (
                <div className="flex flex-col divide-y">
                  {verifications.map((v) => {
                    const viaAgent = !!v.agentId && v.agentId !== v.ownerId
                    // компания не видит человека, которого нашёл верификатор
                    const showTraveler = (v.agentId ?? v.ownerId) === user.id
                    return (
                      <Link
                        key={v.id}
                        href={`/verifications/${v.id}`}
                        className="flex flex-col gap-1 py-2 text-sm hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div>
                          <div className="font-medium">
                            {showTraveler
                              ? (v.verifier?.fullName ?? "Человек ещё не выбран")
                              : `Верификатор ${v.agent ? displayName(v.agent) : "—"}`}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {formatDate(v.handedAt)}
                            {showTraveler && user.role === "VERIFIER" && v.country ? ` · ${v.country}` : ""}
                            {viaAgent && isOwner
                              ? ` · ${formatMoney(v.agentFee)} ${v.agentPaid ? "(оплачено)" : "(не оплачено)"}`
                              : v.payment && showTraveler
                                ? ` · человеку ${formatMoney(v.payment)} ${v.isPaid ? "(оплачено)" : "(не оплачено)"}`
                                : ""}
                          </div>
                        </div>
                        <VerificationStatusBadge status={v.status} />
                      </Link>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="self-start">
          <CardHeader>
            <CardTitle>История</CardTitle>
          </CardHeader>
          <CardContent>
            {events.length === 0 ? (
              <p className="text-sm text-muted-foreground">Пусто</p>
            ) : (
              <ol className="relative flex flex-col gap-4 border-l pl-5">
                {events.map((e) => {
                  const Icon = EVENT_ICON[e.type]
                  return (
                    <li key={e.id} className="relative">
                      <span className="absolute top-0 -left-[29px] flex size-[18px] items-center justify-center rounded-full border bg-background">
                        <Icon className="size-3 text-muted-foreground" />
                      </span>
                      <div className="text-xs text-muted-foreground">
                        {formatDateTime(e.createdAt)}
                        {e.user ? ` · ${e.user.name || e.user.login}` : ""}
                      </div>
                      <div className="text-sm">{e.message}</div>
                    </li>
                  )
                })}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  )
}
