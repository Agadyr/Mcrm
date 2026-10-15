-- Пробовали верифицировать, но IMEI не зарегистрирован в базе
ALTER TYPE "VerificationStatus" ADD VALUE 'NOT_REGISTERED' BEFORE 'REJECTED';
