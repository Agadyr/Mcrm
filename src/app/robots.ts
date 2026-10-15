import type { MetadataRoute } from "next"

// CRM закрыта входом — поисковикам здесь индексировать нечего
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } }
}
