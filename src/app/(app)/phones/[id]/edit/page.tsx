import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { PageHeader } from "@/components/page-header"
import { prisma } from "@/lib/db"
import { requireUser } from "@/lib/auth"
import { dateToYmd } from "@/lib/dates"
import { getPhoneFormHints } from "../../form-data"
import { PhoneForm } from "../../phone-form"

export const metadata: Metadata = { title: "Редактирование телефона" }

export default async function EditPhonePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await requireUser()
  // у верификатора нет склада — его телефоны живут в «Верификациях»
  if (user.role === "VERIFIER") redirect("/verifications")
  const [phone, hints] = await Promise.all([
    prisma.phone.findFirst({ where: { id, ownerId: user.id } }),
    getPhoneFormHints(user.id),
  ])
  if (!phone) notFound()

  return (
    <>
      <PageHeader title="Редактирование" description={phone.model} />
      <PhoneForm
        {...hints}
        phoneId={phone.id}
        defaultValues={{
          model: phone.model,
          memoryGb: phone.memoryGb ? String(phone.memoryGb) : "",
          color: phone.color ?? "",
          imei1: phone.imei1,
          imei2: phone.imei2 ?? "",
          serialNumber: phone.serialNumber ?? "",
          condition: phone.condition,
          purchasePrice: String(phone.purchasePrice),
          receivedAt: dateToYmd(phone.receivedAt),
          supplier: phone.supplier ?? "",
          note: phone.note ?? "",
          status: phone.status,
        }}
      />
    </>
  )
}
