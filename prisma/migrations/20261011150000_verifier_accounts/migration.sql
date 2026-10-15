-- Роль «Верификатор» и передача телефонов верификатору (agentId, agentFee)
-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'VERIFIER';

-- AlterTable
ALTER TABLE "Verification" ADD COLUMN     "agentFee" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "agentId" TEXT,
ADD COLUMN     "agentPaid" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "agentPaidAt" TIMESTAMP(3),
ALTER COLUMN "verifierId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Verification_agentId_status_idx" ON "Verification"("agentId", "status");

-- AddForeignKey
ALTER TABLE "Verification" ADD CONSTRAINT "Verification_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

