-- Статус «На проверке» убран: такие записи возвращаем в «В процессе»
UPDATE "Verification" SET "status" = 'IN_PROGRESS' WHERE "status" = 'CHECKING';

ALTER TYPE "VerificationStatus" RENAME TO "VerificationStatus_old";
CREATE TYPE "VerificationStatus" AS ENUM ('HANDED', 'IN_PROGRESS', 'VERIFIED', 'REJECTED');
ALTER TABLE "Verification" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Verification" ALTER COLUMN "status" TYPE "VerificationStatus" USING ("status"::text::"VerificationStatus");
ALTER TABLE "Verification" ALTER COLUMN "status" SET DEFAULT 'HANDED';
DROP TYPE "VerificationStatus_old";
