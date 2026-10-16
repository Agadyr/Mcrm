-- Заказ Kaspi → несколько продаж (по телефону на каждую единицу товара).
-- Вместо KaspiOrder.saleId (одна продажа) — Sale.kaspiOrderId и позиция заказа, в которую уходит IMEI.
ALTER TABLE "Sale" ADD COLUMN "kaspiOrderId" TEXT;
ALTER TABLE "Sale" ADD COLUMN "kaspiEntryId" TEXT;

-- переносим прежнюю связь; позиция — та, где Kaspi требует IMEI (иначе первая с id)
UPDATE "Sale" s
SET "kaspiOrderId" = o."id",
    "kaspiEntryId" = (
      SELECT e->>'id' FROM jsonb_array_elements(o."entries") e
      WHERE e->>'id' IS NOT NULL
      ORDER BY (e->>'imeiRequired' = 'true') DESC NULLS LAST
      LIMIT 1
    )
FROM "KaspiOrder" o
WHERE o."saleId" = s."id";

ALTER TABLE "KaspiOrder" DROP CONSTRAINT "KaspiOrder_saleId_fkey";
DROP INDEX "KaspiOrder_saleId_key";
ALTER TABLE "KaspiOrder" DROP COLUMN "saleId";

CREATE INDEX "Sale_kaspiOrderId_idx" ON "Sale"("kaspiOrderId");
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_kaspiOrderId_fkey" FOREIGN KEY ("kaspiOrderId") REFERENCES "KaspiOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
