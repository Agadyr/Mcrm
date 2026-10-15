-- Подключение магазина Kaspi: токен API хранится зашифрованным
CREATE TABLE "KaspiShop" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "tokenEnc" TEXT NOT NULL,
    "tokenHint" TEXT NOT NULL,
    "shopName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "lastError" TEXT,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastCheckedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "KaspiShop_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "KaspiShop_ownerId_key" ON "KaspiShop"("ownerId");
ALTER TABLE "KaspiShop" ADD CONSTRAINT "KaspiShop_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
