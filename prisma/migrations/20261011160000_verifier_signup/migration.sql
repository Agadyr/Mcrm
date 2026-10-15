-- Самостоятельная регистрация верификаторов (ждут одобрения администратора)
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "pendingApproval" BOOLEAN NOT NULL DEFAULT false;

