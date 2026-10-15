import type { MetadataRoute } from "next"

/** Установка на телефон как приложение («На экран Домой») */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Учёт телефонов",
    short_name: "Учёт телефонов",
    description: "Склад, продажи и верификация телефонов",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f7fb",
    theme_color: "#3b5bdb",
    lang: "ru",
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png" },
      { src: "/icons/512", sizes: "512x512", type: "image/png" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }
}
