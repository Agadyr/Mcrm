import { z } from "zod"

// Название компании обязательно для компаний; у верификатора — по желанию (проверяется на сервере по роли)
export const profileSchema = z.object({
  companyName: z.string().trim().max(100),
  name: z.string().trim().min(2, "Укажите имя").max(100),
  phone: z
    .string()
    .trim()
    .min(1, "Укажите номер телефона")
    .refine((v) => v.replace(/\D/g, "").length >= 10, "Номер слишком короткий")
    .refine((v) => /^[+\d\s()-]+$/.test(v), "Только цифры, пробелы, +, -, ()"),
})
export type ProfileInput = z.input<typeof profileSchema>

export const newPasswordSchema = z.string().min(6, "Минимум 6 символов").max(100)

export const createUserSchema = z.object({
  login: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "Минимум 3 символа")
    .max(32, "Не более 32 символов")
    .regex(/^[a-z0-9._-]+$/, "Только латинские буквы, цифры, точка, дефис и _"),
  password: newPasswordSchema,
  role: z.enum(["USER", "VERIFIER", "ADMIN"]),
})
export type CreateUserInput = z.input<typeof createUserSchema>

/** Простой для диктовки пароль: без похожих символов (0/O, 1/l) */
export function generatePassword(length = 8) {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789"
  const bytes = new Uint32Array(length)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => chars[b % chars.length]).join("")
}

const loginField = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Минимум 3 символа")
  .max(32, "Не более 32 символов")
  .regex(/^[a-z0-9._-]+$/, "Только латинские буквы, цифры, точка, дефис и _")

/** Самостоятельная регистрация верификатора */
export const verifierSignupSchema = z
  .object({
    name: profileSchema.shape.name,
    phone: profileSchema.shape.phone,
    login: loginField,
    password: newPasswordSchema,
    confirmPassword: z.string(),
    website: z.string().optional(), // ловушка для ботов: люди это поле не видят
  })
  .refine((d) => d.password === d.confirmPassword, { path: ["confirmPassword"], message: "Пароли не совпадают" })
export type VerifierSignupInput = z.input<typeof verifierSignupSchema>
