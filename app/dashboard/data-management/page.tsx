import { BulkUpload } from "@/components/admin/bulk-upload"
import { BulkImportLeaveLoan } from "@/components/admin/bulk-import-leave-loan"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"

export default async function DataManagementPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  // Check if user has admin role - data management is admin-only
  const { data: profile } = await supabase.from("user_profiles").select("role").eq("id", user.id).single()

  if (!profile || profile.role !== "admin") {
    redirect("/dashboard")
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-primary">Data Management</h1>
        <p className="text-muted-foreground">Bulk upload and manage organizational data for QCC</p>
      </div>
      <BulkUpload />
      <BulkImportLeaveLoan />
    </div>
  )
}
