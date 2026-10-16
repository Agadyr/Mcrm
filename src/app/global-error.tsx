"use client"

import { useEffect } from "react"

/** Ошибка в корневом layout: свой html/body, без стилей и шрифтов приложения — они могли сломаться вместе с ним */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <html lang="ru">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", color: "#111", background: "#fff" }}>
        <main style={{ maxWidth: 420, margin: "15vh auto", padding: "0 16px", textAlign: "center" }}>
          <h1 style={{ fontSize: 22, fontWeight: 600 }}>Что-то пошло не так</h1>
          <p style={{ color: "#555", fontSize: 14 }}>Приложение не загрузилось. Попробуйте ещё раз.</p>
          {error.digest && <p style={{ color: "#888", fontSize: 12, fontFamily: "monospace" }}>Код: {error.digest}</p>}
          <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16 }}>
            <button
              onClick={reset}
              style={{ padding: "8px 16px", borderRadius: 8, border: 0, background: "#3b5bdb", color: "#fff", cursor: "pointer" }}
            >
              Повторить
            </button>
            {/* обычная ссылка с полной перезагрузкой: роутер мог упасть вместе с layout */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/" style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #ccc", color: "#111", textDecoration: "none" }}>
              На главную
            </a>
          </div>
        </main>
      </body>
    </html>
  )
}
