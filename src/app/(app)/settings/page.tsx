import { redirect } from "next/navigation"

// Настройки переехали в профиль
export default function SettingsPage() {
  redirect("/profile")
}
