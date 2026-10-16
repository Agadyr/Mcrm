-- Заказы Kaspi: передан в Kaspi Доставку и когда заберёт курьер
ALTER TABLE "KaspiOrder" ADD COLUMN "assembled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "KaspiOrder" ADD COLUMN "courierAt" TIMESTAMP(3);
