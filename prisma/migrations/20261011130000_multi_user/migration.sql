-- Несколько пользователей: у каждого свои телефоны, верификаторы и верификации.
-- Существующие данные закрепляются за первым (уже существующим) пользователем, он становится администратором.

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'USER');

-- AlterTable: профиль и роль пользователя
ALTER TABLE "User" ADD COLUMN     "companyName" TEXT,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "lastLoginAt" TIMESTAMP(3),
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "role" "UserRole" NOT NULL DEFAULT 'USER';

-- Все, кто был до появления ролей, — администраторы (до этого был один пользователь)
UPDATE "User" SET "role" = 'ADMIN';

-- Владелец данных: сначала колонки без NOT NULL, заполняем, затем делаем обязательными
ALTER TABLE "Phone" ADD COLUMN "ownerId" TEXT;
ALTER TABLE "Verifier" ADD COLUMN "ownerId" TEXT;
ALTER TABLE "Verification" ADD COLUMN "ownerId" TEXT;

UPDATE "Phone" SET "ownerId" = (SELECT "id" FROM "User" ORDER BY "createdAt" ASC LIMIT 1) WHERE "ownerId" IS NULL;
UPDATE "Verifier" SET "ownerId" = (SELECT "id" FROM "User" ORDER BY "createdAt" ASC LIMIT 1) WHERE "ownerId" IS NULL;
UPDATE "Verification" SET "ownerId" = (SELECT "id" FROM "User" ORDER BY "createdAt" ASC LIMIT 1) WHERE "ownerId" IS NULL;

ALTER TABLE "Phone" ALTER COLUMN "ownerId" SET NOT NULL;
ALTER TABLE "Verifier" ALTER COLUMN "ownerId" SET NOT NULL;
ALTER TABLE "Verification" ALTER COLUMN "ownerId" SET NOT NULL;

-- IMEI теперь уникален в пределах магазина, а не глобально
DROP INDEX "Phone_imei1_key";
DROP INDEX "Phone_imei2_key";
CREATE UNIQUE INDEX "Phone_ownerId_imei1_key" ON "Phone"("ownerId", "imei1");
CREATE UNIQUE INDEX "Phone_ownerId_imei2_key" ON "Phone"("ownerId", "imei2");

-- Индексы под выборки «по владельцу»
DROP INDEX "Phone_model_idx";
DROP INDEX "Phone_receivedAt_idx";
DROP INDEX "Phone_status_idx";
DROP INDEX "Verification_status_idx";
DROP INDEX "Verifier_fullName_idx";
CREATE INDEX "Phone_ownerId_status_idx" ON "Phone"("ownerId", "status");
CREATE INDEX "Phone_ownerId_model_idx" ON "Phone"("ownerId", "model");
CREATE INDEX "Phone_ownerId_receivedAt_idx" ON "Phone"("ownerId", "receivedAt");
CREATE INDEX "Phone_imei2_idx" ON "Phone"("imei2");
CREATE INDEX "Verification_ownerId_status_idx" ON "Verification"("ownerId", "status");
CREATE INDEX "Verifier_ownerId_fullName_idx" ON "Verifier"("ownerId", "fullName");

-- AddForeignKey
ALTER TABLE "Phone" ADD CONSTRAINT "Phone_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Verifier" ADD CONSTRAINT "Verifier_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Verification" ADD CONSTRAINT "Verification_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
