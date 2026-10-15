-- Заказы Kaspi: обязательный IMEI и накладная Kaspi Доставки
ALTER TABLE "KaspiOrder" ADD COLUMN "imeiRequired" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "KaspiOrder" ADD COLUMN "imeiSentAt" TIMESTAMP(3);
ALTER TABLE "KaspiOrder" ADD COLUMN "waybill" TEXT;
ALTER TABLE "KaspiOrder" ADD COLUMN "waybillNumber" TEXT;
