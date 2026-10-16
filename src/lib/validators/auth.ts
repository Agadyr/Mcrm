import { z } from "zod"

export const loginSchema = z.object({
  login: z.string().trim().toLowerCase().min(1, "Введите логин"),
  password: z.string().min(1, "Введите пароль"),
})

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Введите текущий пароль"),
    newPassword: z.string().min(8, "Минимум 8 символов").max(100),
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    path: ["confirmPassword"],
    message: "Пароли не совпадают",
  })
