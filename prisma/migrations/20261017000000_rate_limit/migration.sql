-- Ограничение попыток входа по паре «IP + логин» и регистраций верификаторов по IP
-- CreateTable
CREATE TABLE "RateLimit" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "windowStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "blockedUntil" TIMESTAMP(3),

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "RateLimit_windowStart_idx" ON "RateLimit"("windowStart");

-- Блокировка всего аккаунта больше не используется — снимаем действующие
UPDATE "User" SET "failedLogins" = 0, "lockedUntil" = NULL;
