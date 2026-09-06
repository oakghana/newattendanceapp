import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { NotificationsClient } from "./notifications-client"

export const metadata = {
  title: "Notifications | QCC Electronic Attendance",
  description: "Track the status of your off-premises attendance requests.",
}

export default async function NotificationsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("first_name, last_name")
    .eq("id", user.id)
    .maybeSingle()

  const displayName = `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim() || null

  return <NotificationsClient displayName={displayName} />
}
