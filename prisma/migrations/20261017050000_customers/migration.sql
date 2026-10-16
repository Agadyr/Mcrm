-- Клиенты: база покупателей магазина, продажа ссылается на клиента

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "customerId" TEXT;

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Customer_ownerId_name_idx" ON "Customer"("ownerId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_ownerId_phone_key" ON "Customer"("ownerId", "phone");

-- CreateIndex
CREATE INDEX "Sale_customerId_idx" ON "Sale"("customerId");

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Перенос старых продаж: у каждого магазина продажи группируются по телефону покупателя.
-- Номер приводится к +7XXXXXXXXXX так же, как normalizeCustomerPhone() в src/lib/customers.ts:
-- «8 7xx…» и «+7 7xx…» (11 цифр) → +7…, «7xx…» (10 цифр) → +7 7xx…; остальное не номер — продажа остаётся без клиента.
-- Имя клиента — из самой поздней продажи, где оно указано. Тест tests/integration/customers.test.ts выполняет этот блок.
-- backfill:start
INSERT INTO "Customer" ("id", "ownerId", "name", "phone", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, g."ownerId", g."name", g."phone", g."firstAt", CURRENT_TIMESTAMP
FROM (
    SELECT n."ownerId", n."phone",
        COALESCE((array_agg(n."name" ORDER BY n."soldAt" DESC, n."createdAt" DESC) FILTER (WHERE n."name" IS NOT NULL))[1], 'Без имени') AS "name",
        min(n."createdAt") AS "firstAt"
    FROM (
        SELECT p."ownerId", NULLIF(btrim(s."buyerName"), '') AS "name", s."soldAt", s."createdAt",
            CASE
                WHEN d."digits" ~ '^[78][0-9]{10}$' THEN '+7' || substr(d."digits", 2)
                WHEN d."digits" ~ '^7[0-9]{9}$' THEN '+7' || d."digits"
            END AS "phone"
        FROM "Sale" s
        JOIN "Phone" p ON p."id" = s."phoneId"
        CROSS JOIN LATERAL (SELECT regexp_replace(COALESCE(s."buyerPhone", ''), '[^0-9]', '', 'g') AS "digits") d
    ) n
    WHERE n."phone" IS NOT NULL
    GROUP BY n."ownerId", n."phone"
) g
ON CONFLICT ("ownerId", "phone") DO NOTHING;

UPDATE "Sale" s
SET "customerId" = m."customerId"
FROM (
    SELECT s2."id", c."id" AS "customerId"
    FROM "Sale" s2
    JOIN "Phone" p ON p."id" = s2."phoneId"
    CROSS JOIN LATERAL (SELECT regexp_replace(COALESCE(s2."buyerPhone", ''), '[^0-9]', '', 'g') AS "digits") d
    JOIN "Customer" c ON c."ownerId" = p."ownerId" AND c."phone" = CASE
        WHEN d."digits" ~ '^[78][0-9]{10}$' THEN '+7' || substr(d."digits", 2)
        WHEN d."digits" ~ '^7[0-9]{9}$' THEN '+7' || d."digits"
    END
    WHERE s2."customerId" IS NULL
) m
WHERE s."id" = m."id";
-- backfill:end
