import { ImageResponse } from "next/og"

/** Иконка приложения: синий квадрат со скруглением и белым телефоном (как логотип в меню) */
export function appIcon(size: number, { rounded = true }: { rounded?: boolean } = {}) {
  const phoneW = Math.round(size * 0.36)
  const phoneH = Math.round(size * 0.56)
  const stroke = Math.max(2, Math.round(size * 0.05))
  return new ImageResponse(
    (
      <div
        style={{
          width: size,
          height: size,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #3b5bdb 0%, #4c6ef5 100%)",
          borderRadius: rounded ? size * 0.22 : 0,
        }}
      >
        <div
          style={{
            width: phoneW,
            height: phoneH,
            border: `${stroke}px solid white`,
            borderRadius: size * 0.08,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            paddingBottom: Math.round(size * 0.05),
          }}
        >
          <div style={{ width: stroke * 1.4, height: stroke * 1.4, borderRadius: 999, background: "white" }} />
        </div>
      </div>
    ),
    { width: size, height: size }
  )
}
