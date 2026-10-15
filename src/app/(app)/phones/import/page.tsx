import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { requireUser } from "@/lib/auth"
import { PageHeader } from "@/components/page-header"
import { ImportWizard } from "./import-wizard"

export const metadata: Metadata = { title: "Импорт из Excel" }

export default async function ImportPage() {
  const user = await requireUser()
  if (user.role === "VERIFIER") redirect("/verifications")
  return (
    <>
      <PageHeader
        title="Импорт товаров из Excel"
        description="Загрузите .xlsx, сопоставьте колонки, проверьте предпросмотр и импортируйте. Дубли IMEI не добавляются."
      />
      <ImportWizard />
    </>
  )
}
