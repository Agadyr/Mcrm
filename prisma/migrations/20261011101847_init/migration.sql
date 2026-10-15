-- CreateEnum
CREATE TYPE "PhoneCondition" AS ENUM ('NEW', 'USED');

-- CreateEnum
CREATE TYPE "PhoneStatus" AS ENUM ('IN_STOCK', 'ON_VERIFICATION', 'SOLD', 'RESERVED', 'RETURNED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'KASPI', 'TRANSFER', 'INSTALLMENT');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('HANDED', 'IN_PROGRESS', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ImeiGiven" AS ENUM ('IMEI1', 'IMEI2', 'BOTH');

-- CreateEnum
CREATE TYPE "PhoneEventType" AS ENUM ('CREATED', 'UPDATED', 'STATUS_CHANGED', 'SOLD', 'SALE_CANCELLED', 'VERIFICATION_CREATED', 'VERIFICATION_UPDATED', 'VERIFICATION_DELETED', 'IMPORTED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "login" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,
    "sessionVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Phone" (
    "id" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "memoryGb" INTEGER,
    "color" TEXT,
    "imei1" TEXT NOT NULL,
    "imei2" TEXT,
    "serialNumber" TEXT,
    "condition" "PhoneCondition" NOT NULL DEFAULT 'NEW',
    "purchasePrice" INTEGER NOT NULL DEFAULT 0,
    "receivedAt" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supplier" TEXT,
    "note" TEXT,
    "status" "PhoneStatus" NOT NULL DEFAULT 'IN_STOCK',
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Phone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sale" (
    "id" TEXT NOT NULL,
    "phoneId" TEXT NOT NULL,
    "salePrice" INTEGER NOT NULL,
    "soldAt" DATE NOT NULL,
    "buyerName" TEXT,
    "buyerPhone" TEXT,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "note" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Verifier" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Verifier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Verification" (
    "id" TEXT NOT NULL,
    "phoneId" TEXT,
    "phoneModel" TEXT NOT NULL,
    "imei1" TEXT NOT NULL,
    "imei2" TEXT,
    "serialNumber" TEXT,
    "verifierId" TEXT NOT NULL,
    "country" TEXT,
    "handedAt" DATE NOT NULL,
    "imeiGiven" "ImeiGiven" NOT NULL DEFAULT 'IMEI1',
    "payment" INTEGER NOT NULL DEFAULT 0,
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "paidAt" TIMESTAMP(3),
    "status" "VerificationStatus" NOT NULL DEFAULT 'HANDED',
    "completedAt" DATE,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhoneEvent" (
    "id" TEXT NOT NULL,
    "phoneId" TEXT NOT NULL,
    "type" "PhoneEventType" NOT NULL,
    "message" TEXT NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PhoneEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_login_key" ON "User"("login");

-- CreateIndex
CREATE UNIQUE INDEX "Phone_imei1_key" ON "Phone"("imei1");

-- CreateIndex
CREATE UNIQUE INDEX "Phone_imei2_key" ON "Phone"("imei2");

-- CreateIndex
CREATE INDEX "Phone_status_idx" ON "Phone"("status");

-- CreateIndex
CREATE INDEX "Phone_model_idx" ON "Phone"("model");

-- CreateIndex
CREATE INDEX "Phone_receivedAt_idx" ON "Phone"("receivedAt");

-- CreateIndex
CREATE INDEX "Phone_serialNumber_idx" ON "Phone"("serialNumber");

-- CreateIndex
CREATE INDEX "Sale_soldAt_idx" ON "Sale"("soldAt");

-- CreateIndex
CREATE INDEX "Sale_phoneId_cancelledAt_idx" ON "Sale"("phoneId", "cancelledAt");

-- CreateIndex
CREATE INDEX "Sale_buyerName_idx" ON "Sale"("buyerName");

-- CreateIndex
CREATE INDEX "Verifier_fullName_idx" ON "Verifier"("fullName");

-- CreateIndex
CREATE INDEX "Verification_status_idx" ON "Verification"("status");

-- CreateIndex
CREATE INDEX "Verification_imei1_idx" ON "Verification"("imei1");

-- CreateIndex
CREATE INDEX "Verification_verifierId_idx" ON "Verification"("verifierId");

-- CreateIndex
CREATE INDEX "Verification_phoneId_idx" ON "Verification"("phoneId");

-- CreateIndex
CREATE INDEX "PhoneEvent_phoneId_createdAt_idx" ON "PhoneEvent"("phoneId", "createdAt");

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_phoneId_fkey" FOREIGN KEY ("phoneId") REFERENCES "Phone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Verification" ADD CONSTRAINT "Verification_phoneId_fkey" FOREIGN KEY ("phoneId") REFERENCES "Phone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Verification" ADD CONSTRAINT "Verification_verifierId_fkey" FOREIGN KEY ("verifierId") REFERENCES "Verifier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhoneEvent" ADD CONSTRAINT "PhoneEvent_phoneId_fkey" FOREIGN KEY ("phoneId") REFERENCES "Phone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhoneEvent" ADD CONSTRAINT "PhoneEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
