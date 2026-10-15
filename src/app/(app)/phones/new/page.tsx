import { redirect } from "next/navigation"
import type { Metadata } from "next"
import { PageHeader } from "@/components/page-header"
import { requireUser } from "@/lib/auth"
import { todayYmd } from "@/lib/dates"
import { getPhoneFormHints } from "../form-data"
import { PhoneForm } from "../phone-form"

export const metadata: Metadata = { title: "Новый телефон" }

export default async function NewPhonePage() {
  const user = await requireUser()
  // у верификатора нет склада — его телефоны живут в «Верификациях»
  if (user.role === "VERIFIER") redirect("/verifications")
  const hints = await getPhoneFormHints(user.id)
  return (
    <>
      <PageHeader title="Новый телефон" />
      <PhoneForm
        {...hints}
        defaultValues={{
          model: "",
          memoryGb: "",
          color: "",
          imei1: "",
          imei2: "",
          serialNumber: "",
          condition: "NEW",
          purchasePrice: "",
          receivedAt: todayYmd(),
          supplier: "",
          note: "",
          status: "IN_STOCK",
        }}
      />
    </>
  )
}
