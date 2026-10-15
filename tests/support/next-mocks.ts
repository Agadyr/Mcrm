// Заглушки next/headers и next/navigation для вызова server actions в тестах

export const cookieJar = new Map<string, string>()

const cookieStore = {
  get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name)! } : undefined),
  set: (name: string, value: string) => void cookieJar.set(name, value),
  delete: (name: string) => void cookieJar.delete(name),
  has: (name: string) => cookieJar.has(name),
}

export const headersModule = {
  cookies: async () => cookieStore,
  headers: async () => new Headers(),
}

/** redirect() в Next.js бросает исключение — повторяем это, чтобы проверять перенаправления */
export class RedirectError extends Error {
  constructor(public url: string) {
    super(`NEXT_REDIRECT ${url}`)
  }
}

export const navigationModule = {
  redirect: (url: string) => {
    throw new RedirectError(url)
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND")
  },
}
