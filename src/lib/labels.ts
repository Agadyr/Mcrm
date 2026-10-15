import type {
  RfsStatus,
  ImeiGiven,
  PaymentMethod,
  PhoneCondition,
  PhoneStatus,
  VerificationStatus,
} from "@prisma/client"

export const PHONE_STATUS_LABEL: Record<PhoneStatus, string> = {
  IN_STOCK: "В наличии",
  ON_VERIFICATION: "На верификации",
  SOLD: "Продан",
  RESERVED: "Резерв",
  RETURNED: "Возврат",
}

/** Цвет точки статуса (во вкладках и значках) */
export const PHONE_STATUS_DOT: Record<PhoneStatus, string> = {
  IN_STOCK: "bg-emerald-500",
  ON_VERIFICATION: "bg-amber-500",
  SOLD: "bg-zinc-400",
  RESERVED: "bg-sky-500",
  RETURNED: "bg-rose-500",
}

export const VERIFICATION_STATUS_DOT: Record<VerificationStatus, string> = {
  HANDED: "bg-sky-500",
  IN_PROGRESS: "bg-amber-500",
  VERIFIED: "bg-emerald-500",
  NOT_REGISTERED: "bg-orange-500",
  REJECTED: "bg-rose-500",
}

export const PHONE_STATUS_COLOR: Record<PhoneStatus, string> = {
  IN_STOCK: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  ON_VERIFICATION: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  SOLD: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
  RESERVED: "bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  RETURNED: "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
}

export const PHONE_CONDITION_LABEL: Record<PhoneCondition, string> = {
  NEW: "Новый",
  USED: "Б/у",
}

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: "Наличные",
  KASPI: "Kaspi",
  TRANSFER: "Перевод",
  INSTALLMENT: "Рассрочка",
  DEBT: "В долг",
}

export const VERIFICATION_STATUS_LABEL: Record<VerificationStatus, string> = {
  HANDED: "Передан",
  IN_PROGRESS: "В процессе",
  VERIFIED: "Верифицирован",
  NOT_REGISTERED: "Не зарегистрирован",
  REJECTED: "Отказ",
}

export const VERIFICATION_STATUS_COLOR: Record<VerificationStatus, string> = {
  HANDED: "bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  IN_PROGRESS: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300",
  VERIFIED: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  NOT_REGISTERED: "bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-300",
  REJECTED: "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
}

export const IMEI_GIVEN_LABEL: Record<ImeiGiven, string> = {
  IMEI1: "IMEI1",
  IMEI2: "IMEI2",
  BOTH: "Оба",
}

export const PHONE_STATUSES = Object.keys(PHONE_STATUS_LABEL) as PhoneStatus[]
export const VERIFICATION_STATUSES = Object.keys(VERIFICATION_STATUS_LABEL) as VerificationStatus[]
/** Как можно продать: способы оплаты и «В долг» */
export const SALE_METHODS = Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]
/** Чем можно заплатить (оплата долга, предоплата) — без «В долг» */
export const PAYMENT_METHODS = SALE_METHODS.filter((m) => m !== "DEBT")
/** Телефон ещё на верификации: передан или в процессе */
export const ACTIVE_VERIFICATION_STATUSES: VerificationStatus[] = ["HANDED", "IN_PROGRESS"]
/** Верификация закончена: результат есть, дата завершения ставится сама */
export const FINAL_VERIFICATION_STATUSES: VerificationStatus[] = ["VERIFIED", "NOT_REGISTERED", "REJECTED"]
/** Телефон с такой верификацией нельзя отдать снова: она идёт или уже успешна */
export const BLOCKING_VERIFICATION_STATUSES: VerificationStatus[] = ["HANDED", "IN_PROGRESS", "VERIFIED"]
/** Не получилось — человеку и верификатору за такой телефон не платим (долг не считается) */
export const UNPAID_VERIFICATION_STATUSES: VerificationStatus[] = ["REJECTED", "NOT_REGISTERED"]

export const RFS_URL = "https://imei.rfs.gov.kz/"

export const RFS_STATUS_LABEL: Record<RfsStatus, string> = {
  REGISTERED: "Зарегистрирован",
  NOT_REGISTERED: "Не зарегистрирован",
}
