-- Утреннее напоминание в Telegram: можно выключить, и отправляется не чаще раза в день
ALTER TABLE "User" ADD COLUMN "morningReminder" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "lastReminderAt" TIMESTAMP(3);
