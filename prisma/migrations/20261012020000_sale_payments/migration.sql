-- Продажи в долг: история оплат, сколько уже оплачено, срок возврата долга
ALTER TYPE "PhoneEventType" ADD VALUE 'SALE_PAYMENT';

ALTER TABLE "Sale" ADD COLUMN "paidAmount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Sale" ADD COLUMN "dueDate" DATE;

CREATE TABLE "SalePayment" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "paidAt" DATE NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SalePayment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SalePayment_saleId_paidAt_idx" ON "SalePayment"("saleId", "paidAt");
ALTER TABLE "SalePayment" ADD CONSTRAINT "SalePayment_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Все прежние продажи были оплачены полностью в день продажи
INSERT INTO "SalePayment" ("id", "saleId", "amount", "paidAt", "method", "createdAt")
SELECT 'mig' || md5("id"), "id", "salePrice", "soldAt", "paymentMethod", "createdAt" FROM "Sale" WHERE "salePrice" > 0;
UPDATE "Sale" SET "paidAmount" = "salePrice";
