import { SmtpSettingsPanel } from "@/components/admin/smtp-settings-panel"
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"

export const metadata = {
  title: "Notification & SMTP Settings | QCC Electronic Attendance",
  description: "Configure workflow email delivery for leave and loan notifications",
}

export default async function NotificationSettingsPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login")
  }

  const { data: profile } = await supabase.from("user_profiles").select("role").eq("id", user.id).single()

  if (profile?.role !== "admin") {
    redirect("/dashboard")
  }

  return <SmtpSettingsPanel />
}
