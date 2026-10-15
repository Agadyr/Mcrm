import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { PageHeader } from "@/components/page-header"
import { requireUser } from "@/lib/auth"
import { todayYmd } from "@/lib/dates"
import { getAgentOptions, getBlockedPhones, getStockPhones } from "../form-data"
import { HandoverMode } from "../handover-mode"
import { BatchHandoverForm } from "./batch-form"

export const metadata: Metadata = { title: "Передать несколько телефонов" }

export default async function BatchHandoverPage({
  searchParams,
}: {
  searchParams: Promise<{ agent?: string; phones?: string }>
}) {
  const { agent, phones: phoneIds } = await searchParams
  const user = await requireUser()
  // у верификатора нет склада и он не передаёт телефоны другим
  if (user.role === "VERIFIER") redirect("/verifications/new")

  const [phones, agents, blocked] = await Promise.all([
    getStockPhones(user.id),
    getAgentOptions(user.id),
    getBlockedPhones(user.id),
  ])
  const preselected = (phoneIds ?? "").split(",").filter((id) => phones.some((p) => p.id === id))

  return (
    <>
      <PageHeader
        title="Передать несколько телефонов"
        description="Выберите верификатора и отметьте проданные телефоны — по каждому появится отдельная запись со своим статусом"
      />
      <HandoverMode active="batch" />
      <BatchHandoverForm
        phones={phones}
        blocked={blocked}
        agents={agents}
        defaultAgentId={agents.some((a) => a.id === agent) ? agent! : ""}
        defaultPhoneIds={preselected}
        today={todayYmd()}
      />
    </>
  )
}
