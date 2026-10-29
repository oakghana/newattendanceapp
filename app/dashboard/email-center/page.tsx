import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import EmailCenterClient from "./email-center-client"

export default async function EmailCenterPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")
  const { data: profile } = await supabase.from("user_profiles").select("role").eq("id", user.id).single()
  const role = String(profile?.role || "").toLowerCase().replace(/[\s-]+/g, "_")
  if (!["admin", "administrator"].includes(role)) redirect("/dashboard")
  return <EmailCenterClient />
}
