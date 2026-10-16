import { z } from "zod"
import { optText, reqText } from "./common"

/** Карточка клиента: имя и заметка (номер — ключ клиента, его не меняем) */
export const customerSchema = z.object({
  name: reqText("Укажите имя", 100),
  note: optText(2000),
})

export type CustomerInput = z.input<typeof customerSchema>
