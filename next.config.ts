import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // отдельная папка сборки для второго сервера (тесты), чтобы не мешать основному `npm run dev`
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // значок Next.js в режиме разработки закрывает нижнее меню на телефоне
  devIndicators: false,
  // открывать сайт в режиме разработки с телефона по адресу компьютера в домашней сети
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.16.*.*"],
  experimental: {
    // импорт Excel передаёт файл и строки через server actions
    serverActions: { bodySizeLimit: "15mb" },
  },
  serverExternalPackages: ["exceljs"],
  // базовые заголовки безопасности: сайт нельзя встроить в чужой iframe (кликджекинг),
  // браузер не угадывает тип файлов, а адрес страницы не уходит на чужие сайты целиком
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ]
  },
}

export default nextConfig
