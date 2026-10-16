// Подпись и проверка сессионного токена. Без зависимостей от Node — используется и в middleware (edge).
import { SignJWT, jwtVerify } from "jose"

export const SESSION_COOKIE = "mcrm_session"
export const SESSION_MAX_AGE = 60 * 60 * 24 * 14 // 14 дней

export type SessionPayload = {
  sub: string // id пользователя
  login: string
  v: number // sessionVersion
}

function getSecret() {
  const secret = process.env.AUTH_SECRET
  if (!secret) throw new Error("AUTH_SECRET не задан в .env")
  return new TextEncoder().encode(secret)
}

export async function signSession(payload: SessionPayload) {
  return new SignJWT({ login: payload.login, v: payload.v })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(getSecret())
}

export async function verifySession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, getSecret())
    if (!payload.sub || typeof payload.login !== "string" || typeof payload.v !== "number") return null
    return { sub: payload.sub, login: payload.login, v: payload.v }
  } catch {
    return null
  }
}
