-- Прайс-лист для Kaspi: настройки магазина и товары (цены, остатки считаются по складу)
ALTER TABLE "KaspiShop" ADD COLUMN "merchantId" TEXT;
ALTER TABLE "KaspiShop" ADD COLUMN "storeId" TEXT;
ALTER TABLE "KaspiShop" ADD COLUMN "feedToken" TEXT;
CREATE UNIQUE INDEX "KaspiShop_feedToken_key" ON "KaspiShop"("feedToken");

CREATE TABLE "KaspiOffer" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "brand" TEXT,
    "model" TEXT NOT NULL,
    "memoryGb" INTEGER,
    "color" TEXT,
    "price" INTEGER NOT NULL,
    "preOrderDays" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "KaspiOffer_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "KaspiOffer_ownerId_sku_key" ON "KaspiOffer"("ownerId", "sku");
ALTER TABLE "KaspiOffer" ADD CONSTRAINT "KaspiOffer_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
