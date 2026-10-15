import type { CurrentUser } from "@/lib/auth"

// Шаг диалога хранится в User.telegramState между сообщениями

export type AddPhoneState = {
  flow: "add"
  step: "model" | "imei1" | "imei2" | "serial" | "memory" | "condition" | "price" | "supplier" | "confirm"
  d: {
    model?: string
    imei1?: string
    imei2?: string | null
    serialNumber?: string | null
    memoryGb?: number | null
    condition?: "NEW" | "USED"
    purchasePrice?: number
    supplier?: string | null
  }
  /** подсказки для текущего шага (кнопки «v:<номер>») */
  opts?: string[]
  /** данные прислали одним сообщением — спрашиваем только недостающее */
  quick?: boolean
  /** шаг открыт кнопкой «изменить» с экрана проверки — после него вернуться к проверке */
  back?: boolean
}

export type SellState = {
  flow: "sell"
  step: "pick" | "price" | "method" | "buyer" | "buyerPhone" | "prepay" | "due" | "confirm"
  d: {
    phoneId?: string
    salePrice?: number
    paymentMethod?: "CASH" | "KASPI" | "TRANSFER" | "INSTALLMENT" | "DEBT"
    buyerName?: string | null
    buyerPhone?: string | null
    paidNow?: number
    dueDate?: string | null
  }
}

export type VerifyState = {
  flow: "verify"
  step: "pick" | "imei2" | "serial" | "to" | "person" | "newName" | "newPhone" | "country" | "payment" | "agentFee" | "confirm"
  d: {
    phoneId?: string
    verifierMode?: "existing" | "new" | "agent"
    agentId?: string
    agentName?: string
    verifierId?: string
    verifierName?: string
    verifierPhone?: string | null
    country?: string | null
    payment?: number
    agentFee?: number
  }
  opts?: string[]
}

export type FindState = { flow: "find" }

export type BotState = AddPhoneState | SellState | VerifyState | FindState

export type Ctx = {
  chatId: number
  user: CurrentUser
}

/** Что пришло от пользователя: текст или нажатие кнопки */
export type Input = { kind: "text"; text: string } | { kind: "button"; data: string; label?: string }
