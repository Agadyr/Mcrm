-- Заказы Kaspi магазина и настройки синхронизации
ALTER TABLE "KaspiShop" ADD COLUMN "autoAccept" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "KaspiShop" ADD COLUMN "lastSyncAt" TIMESTAMP(3);
ALTER TABLE "KaspiShop" ADD COLUMN "lastSyncError" TEXT;

CREATE TABLE "KaspiOrder" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "kaspiId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "totalPrice" INTEGER NOT NULL,
    "paymentMode" TEXT,
    "deliveryMode" TEXT,
    "isKaspiDelivery" BOOLEAN NOT NULL DEFAULT false,
    "orderedAt" TIMESTAMP(3) NOT NULL,
    "plannedDeliveryAt" TIMESTAMP(3),
    "customerName" TEXT,
    "customerPhone" TEXT,
    "address" TEXT,
    "entries" JSONB NOT NULL DEFAULT '[]',
    "saleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "KaspiOrder_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "KaspiOrder_ownerId_kaspiId_key" ON "KaspiOrder"("ownerId", "kaspiId");
CREATE UNIQUE INDEX "KaspiOrder_saleId_key" ON "KaspiOrder"("saleId");
CREATE INDEX "KaspiOrder_ownerId_state_idx" ON "KaspiOrder"("ownerId", "state");
CREATE INDEX "KaspiOrder_ownerId_orderedAt_idx" ON "KaspiOrder"("ownerId", "orderedAt");
ALTER TABLE "KaspiOrder" ADD CONSTRAINT "KaspiOrder_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KaspiOrder" ADD CONSTRAINT "KaspiOrder_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;
