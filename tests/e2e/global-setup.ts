import { execSync } from "node:child_process"
import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"
import { e2eEnv } from "../../playwright.config"
import { ADMIN } from "./fixtures"

/** Чистая e2e-база с миграциями и администратором с заполненным профилем */
export default async function globalSetup() {
  if (!e2eEnv.DATABASE_URL) throw new Error("Для e2e задайте E2E_DATABASE_URL или DATABASE_URL")
  execSync("npx prisma migrate deploy", { stdio: ["ignore", "ignore", "inherit"], env: { ...process.env, ...e2eEnv } })

  const prisma = new PrismaClient({ datasourceUrl: e2eEnv.DATABASE_URL })
  try {
    const tables = await prisma.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`
    await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} CASCADE`)
    await prisma.user.create({
      data: {
        login: ADMIN.login,
        passwordHash: await bcrypt.hash(ADMIN.password, 4),
        role: "ADMIN",
        name: "Админ",
        companyName: "E2E Store",
        phone: "+7 701 000 00 00",
      },
    })
  } finally {
    await prisma.$disconnect()
  }
}
