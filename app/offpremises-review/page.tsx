import { OffPremisesReviewLog } from "@/components/admin/offpremises-review-log"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"

export default async function OffPremisesReviewPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  
  if (!user) {
    redirect("/auth/login")
  }

  // Check if user has admin, it-admin, or department_head role
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .single()

  if (!profile || !["admin", "it-admin", "department_head", "regional_manager", "accounts_executive"].includes(String(profile.role || "").toLowerCase())) {
    redirect("/dashboard")
  }

  return <OffPremisesReviewLog />
}
