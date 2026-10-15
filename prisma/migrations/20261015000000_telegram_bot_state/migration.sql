-- Состояние диалога с Telegram-ботом (какой шаг формы сейчас заполняется)
ALTER TABLE "User" ADD COLUMN "telegramState" JSONB;
