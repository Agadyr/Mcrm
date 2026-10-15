-- CreateEnum
CREATE TYPE "RfsStatus" AS ENUM ('REGISTERED', 'NOT_REGISTERED');

-- AlterEnum
ALTER TYPE "PhoneEventType" ADD VALUE 'RFS_CHECK';

-- AlterTable
ALTER TABLE "Phone" ADD COLUMN     "rfsCheckedAt" TIMESTAMP(3),
ADD COLUMN     "rfsStatus" "RfsStatus";
