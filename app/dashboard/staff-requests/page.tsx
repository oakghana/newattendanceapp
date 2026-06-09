import { createAdminClient, createClient } from "@/lib/supabase/server"
import { StaffRequestsClient } from "./staff-requests-client"

export default async function StaffRequestsPage() {
  const supabase = await createClient()
  const admin = await createAdminClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return <div>Please log in</div>
  }

  // Get user profile
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("id, role, first_name, last_name, employee_id, position, departments(name)")
    .eq("id", user.id)
    .single()

  if (!profile) {
    return <div>Profile not found</div>
  }

  // Fetch staff's own deferment requests
  const { data: defermentRequests } = await admin
    .from("deferment_requests")
    .select(`
      id,
      user_id,
      reason,
      requested_deferment_period,
      requested_deferment_year,
      deferment_start_date,
      deferment_end_date,
      original_start_date,
      original_end_date,
      status,
      created_at,
      user_profiles!deferment_requests_user_id_fkey (
        id,
        first_name,
        last_name,
        employee_id,
        position,
        departments(name)
      )
    `)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })

  // Fetch staff's own recall requests
  const { data: recallRequests } = await admin
    .from("recall_requests")
    .select(`
      id,
      staff_user_id,
      recall_date,
      recall_reason,
      recall_notes,
      status,
      created_at,
      user_profiles!recall_requests_staff_user_id_fkey (
        id,
        first_name,
        last_name,
        employee_id,
        position,
        departments(name)
      )
    `)
    .eq("staff_user_id", user.id)
    .order("created_at", { ascending: false })

  return (
    <div>
      <StaffRequestsClient
        userId={user.id}
        userProfile={profile}
        initialDefermentRequests={defermentRequests || []}
        initialRecallRequests={recallRequests || []}
      />
    </div>
  )
}
