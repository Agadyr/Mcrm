import type { Instrumentation } from "next"

// Серверные ошибки страниц, route handlers и server actions — в одном месте.
// digest совпадает с «Код: …» на странице ошибки — по нему находим запись в логах хостинга.

/** Одна строка JSON на ошибку: удобно искать и фильтровать в логах */
function errorLogEntry(...[error, request, context]: Parameters<Instrumentation.onRequestError>) {
  const err = error instanceof Error ? (error as Error & { digest?: string }) : null
  return {
    level: "error",
    message: err?.message ?? String(error),
    digest: err?.digest,
    method: request.method,
    path: request.path,
    route: context.routePath,
    routeType: context.routeType,
    renderSource: context.renderSource,
    stack: err?.stack,
  }
}

export const onRequestError: Instrumentation.onRequestError = (error, request, context) => {
  console.error("[request-error]", JSON.stringify(errorLogEntry(error, request, context)))
  // Трекер ошибок (Sentry и т.п.) подключать здесь: register() с init SDK + отправка error/request/context
}
