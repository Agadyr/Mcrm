-- Kaspi: захват синхронизации — два одновременных запуска не обрабатывают заказы дважды
ALTER TABLE "KaspiShop" ADD COLUMN "syncStartedAt" TIMESTAMP(3);
