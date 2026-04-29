import { createClient } from "@/lib/supabase/server"
import { LeaveNotificationsClient } from "./leave-notifications-client"

export default async function LeaveNotificationsManagementPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return <div>Please log in</div>
  }

  // Get user profile
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .single()

  return (
    <div className="leave-theme">
      <LeaveNotificationsClient userRole={profile?.role || null} />
    </div>
  )
}
