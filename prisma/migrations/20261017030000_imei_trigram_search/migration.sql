-- Поиск по части IMEI (`contains` → LIKE '%…%'): без триграмм — полный перебор таблицы.
-- pg_trgm есть в обычном PostgreSQL, Neon и Supabase.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateIndex
CREATE INDEX "Phone_imei1_trgm_idx" ON "Phone" USING GIN ("imei1" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Phone_imei2_trgm_idx" ON "Phone" USING GIN ("imei2" gin_trgm_ops);
