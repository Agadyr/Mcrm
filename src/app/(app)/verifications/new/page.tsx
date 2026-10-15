import type { Metadata } from "next"
import { PageHeader } from "@/components/page-header"
import { requireUser } from "@/lib/auth"
import { todayYmd } from "@/lib/dates"
import { DEFAULT_VERIFICATION_PAYMENT } from "@/lib/validators/verification"
import { getAgentOptions, getStockPhones, getVerifierOptions } from "../form-data"
import { HandoverMode } from "../handover-mode"
import { VerificationForm } from "../verification-form"

export const metadata: Metadata = { title: "Новая верификация" }

export default async function NewVerificationPage({
  searchParams,
}: {
  searchParams: Promise<{ phoneId?: string; verifier?: string; agent?: string }>
}) {
  const { phoneId, verifier, agent } = await searchParams
  const user = await requireUser()
  const isVerifier = user.role === "VERIFIER"
  const [phones, verifiers, agents] = await Promise.all([
    getStockPhones(user.id),
    getVerifierOptions(user.id),
    isVerifier ? Promise.resolve([]) : getAgentOptions(user.id),
  ])
  const presetPhone = phones.find((p) => p.id === phoneId)
  const presetVerifier = verifiers.find((v) => v.id === verifier)
  const presetAgent = agents.find((a) => a.id === agent)

  return (
    <>
      <PageHeader
        title={presetAgent ? "Передать верификатору" : "Новая верификация"}
        description={
          isVerifier ? "Телефон клиента, которого нет в системе" : "Отдайте телефон человеку сами или передайте верификатору"
        }
      />
      {!isVerifier && <HandoverMode active="single" />}
      <VerificationForm
        phones={phones}
        verifiers={verifiers}
        agents={agents}
        viewerRole={isVerifier ? "verifier" : "company"}
        defaultValues={{
          phoneMode: !isVerifier && (presetPhone || phones.length > 0) ? "stock" : "manual",
          phoneId: presetPhone?.id ?? "",
          phoneModel: "",
          imei1: "",
          imei2: "",
          serialNumber: "",
          verifierMode: presetAgent ? "agent" : presetVerifier || verifiers.length > 0 ? "existing" : "new",
          verifierId: presetVerifier?.id ?? "",
          verifierName: "",
          verifierPhone: "",
          agentId: presetAgent?.id ?? "",
          agentFee: String(DEFAULT_VERIFICATION_PAYMENT),
          agentPaid: false,
          country: "",
          handedAt: todayYmd(),
          payment: isVerifier ? "" : String(DEFAULT_VERIFICATION_PAYMENT),
          isPaid: false,
          status: "HANDED",
          note: "",
        }}
      />
    </>
  )
}
