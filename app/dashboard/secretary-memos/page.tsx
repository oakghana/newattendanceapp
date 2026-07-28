import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { SecretaryMemosClient } from "./secretary-memos-client"

export default async function SecretaryMemosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("id, role, first_name, last_name, rank_position, profile_image_url, departments(name)")
    .eq("id", user.id)
    .maybeSingle()

  if (!profile || !["secretary", "admin"].includes(profile.role)) {
    redirect("/dashboard/overview")
  }

  const admin = createAdminClient()

  // Fetch approved loan memos (HR Executive approved stage and above)
  const { data: loanMemos } = await admin
    .from("loan_requests")
    .select(`
      id,
      request_number,
      loan_type_label,
      fixed_amount,
      requested_amount,
      status,
      created_at,
      md_approved_at,
      md_approved_by_name,
      staff_full_name,
      staff_number,
      user_profiles!user_id (
        first_name,
        last_name,
        employee_id,
        rank_position,
        profile_image_url
      )
    `)
    .in("status", ["approved_director", "staff_receiving_funds", "partially_recovered"])
    .order("created_at", { ascending: false })
    .limit(300)

  // Fetch approved leave memos
  const { data: leaveMemos } = await admin
    .from("leave_requests")
    .select(`
      id,
      leave_type,
      status,
      start_date,
      end_date,
      reason,
      created_at,
      user_id,
      user_profiles!user_id (
        first_name,
        last_name,
        employee_id,
        rank_position,
        profile_image_url,
        departments(name)
      )
    `)
    .in("status", ["approved", "hr_approved", "hod_approved"])
    .order("created_at", { ascending: false })
    .limit(300)

  return (
    <SecretaryMemosClient
      profile={profile}
      loanMemos={loanMemos || []}
      leaveMemos={leaveMemos || []}
    />
  )
}
