import { AuditLogsClient } from "@/components/admin/audit-logs-client"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"

export default async function AuditLogsPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  // Check if user has admin role - audit logs are admin-only
  const { data: profile } = await supabase.from("user_profiles").select("role").eq("id", user.id).single()

  if (!profile || (!["admin", "administrator"].includes(String(profile.role).toLowerCase()) && profile.role !== "audit_staff")) {
    redirect("/dashboard")
  }

  return <AuditLogsClient />
}
