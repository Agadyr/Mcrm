import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ChevronLeftIcon } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { VerificationStatusBadge } from "@/components/status-badge"
import { prisma } from "@/lib/db"
import { requireUser } from "@/lib/auth"
import { dateToYmd } from "@/lib/dates"
import { formatDateTime } from "@/lib/format"
import { displayName, verificationAccessWhere } from "@/server/access"
import { getAgentOptions, getStockPhones, getVerifierOptions } from "../form-data"
import { VerificationForm } from "../verification-form"
import { AgentWorkForm } from "../agent-work-form"
import { DeleteVerificationButton } from "../verification-row-actions"

export const metadata: Metadata = { title: "Верификация" }

export default async function VerificationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await requireUser()
  const v = await prisma.verification.findFirst({
    where: { id, ...verificationAccessWhere(user.id) },
    include: {
      verifier: true,
      agent: { select: { name: true, login: true } },
      owner: { select: { name: true, login: true, companyName: true } },
    },
  })
  if (!v) notFound()

  const isOwner = v.ownerId === user.id
  const viaAgent = !!v.agentId && v.agentId !== v.ownerId
  const back = (
    <Link href="/verifications" className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
      <ChevronLeftIcon className="size-4" /> Верификация телефонов
    </Link>
  )

  // ── Верификатор открыл телефон компании: работает со своей частью
  if (!isOwner) {
    const verifiers = await getVerifierOptions(user.id)
    return (
      <>
        <PageHeader
          back={back}
          title={v.phoneModel}
          description={
            <div className="flex flex-wrap items-center gap-2">
              <VerificationStatusBadge status={v.status} />
              <span>от {v.owner.companyName || displayName(v.owner)}</span>
              {v.phoneId && (
                <Link href={`/phones/${v.phoneId}`} className="underline">
                  Карточка телефона
                </Link>
              )}
            </div>
          }
        />
        <AgentWorkForm
          verificationId={v.id}
          verifiers={verifiers}
          job={{
            companyName: v.owner.companyName || displayName(v.owner),
            phoneModel: v.phoneModel,
            imei1: v.imei1,
            imei2: v.imei2,
            serialNumber: v.serialNumber,
            handedAt: v.handedAt,
            agentFee: v.agentFee,
            agentPaid: v.agentPaid,
            note: v.note,
          }}
          defaultValues={{
            verifierMode: v.verifierId ? "existing" : "none",
            verifierId: v.verifierId ?? "",
            verifierName: "",
            verifierPhone: "",
            country: v.country ?? "",
            status: v.status,
            payment: v.payment ? String(v.payment) : "",
            isPaid: v.isPaid,
            agentNote: v.agentNote ?? "",
          }}
        />
      </>
    )
  }

  // ── Владелец телефона
  const isVerifier = user.role === "VERIFIER"
  const [phones, verifiers, agents] = await Promise.all([
    getStockPhones(user.id, [v.phoneId]),
    getVerifierOptions(user.id),
    isVerifier ? Promise.resolve([]) : getAgentOptions(user.id),
  ])
  const who = viaAgent ? `верификатору ${v.agent ? displayName(v.agent) : "—"}` : (v.verifier?.fullName ?? "—")

  return (
    <>
      <PageHeader
        back={back}
        title={`${v.phoneModel} → ${who}`}
        description={
          <div className="flex flex-wrap items-center gap-2">
            <VerificationStatusBadge status={v.status} />
            <span>Создана {formatDateTime(v.createdAt)}</span>
            {viaAgent && <span>· статус ведёт верификатор</span>}
            {v.phoneId ? (
              <Link href={`/phones/${v.phoneId}`} className="underline">
                Карточка товара
              </Link>
            ) : (
              <span>Телефон не привязан к товарам</span>
            )}
          </div>
        }
        actions={<DeleteVerificationButton id={v.id} />}
      />
      <VerificationForm
        verificationId={v.id}
        phones={phones}
        verifiers={verifiers}
        agents={agents}
        viewerRole={isVerifier ? "verifier" : "company"}
        defaultValues={{
          phoneMode: v.phoneId ? "stock" : "manual",
          phoneId: v.phoneId ?? "",
          phoneModel: v.phoneModel,
          imei1: v.imei1,
          imei2: v.imei2 ?? "",
          serialNumber: v.serialNumber ?? "",
          verifierMode: viaAgent ? "agent" : "existing",
          // человек, которого нашёл верификатор, компании не передаётся
          verifierId: viaAgent ? "" : (v.verifierId ?? ""),
          verifierName: "",
          verifierPhone: "",
          agentId: viaAgent ? v.agentId : "",
          agentFee: v.agentFee ? String(v.agentFee) : "",
          agentPaid: v.agentPaid,
          country: viaAgent ? "" : (v.country ?? ""),
          handedAt: dateToYmd(v.handedAt),
          payment: !viaAgent && v.payment ? String(v.payment) : "",
          isPaid: viaAgent ? false : v.isPaid,
          status: v.status,
          note: v.note ?? "",
        }}
      />
    </>
  )
}
