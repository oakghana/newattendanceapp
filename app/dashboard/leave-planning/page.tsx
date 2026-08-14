import { redirect } from "next/navigation"

// Leave Planning has been consolidated into the single Leave Management
// workflow at /dashboard/leave-management (see the "Leave Center" tab there,
// which renders the same LeavePlanningClient component). This route now only
// exists to catch old links/bookmarks and send people to the one canonical
// dashboard.
export default function LeavePlanningPage() {
  redirect("/dashboard/leave-management")
}
