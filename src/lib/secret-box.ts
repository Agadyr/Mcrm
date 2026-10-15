import "server-only"
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"

// Шифрование секретов в базе (токены внешних сервисов). Ключ выводится из AUTH_SECRET:
// без него расшифровать токен из копии базы нельзя. Формат: base64(iv).base64(tag).base64(текст).

function key() {
  const secret = process.env.AUTH_SECRET
  if (!secret) throw new Error("AUTH_SECRET не задан в .env")
  return createHash("sha256").update(`mcrm-secret-box:${secret}`).digest()
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key(), iv)
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64")).join(".")
}

export function decryptSecret(box: string): string {
  const [iv, tag, data] = box.split(".").map((p) => Buffer.from(p, "base64"))
  const decipher = createDecipheriv("aes-256-gcm", key(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8")
}
