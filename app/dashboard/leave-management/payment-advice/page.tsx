import { createClient } from "@/lib/supabase/server"
import { PaymentAdviceClient } from "@/components/leave/payment-advice-client"
import { redirect } from "next/navigation"

export const metadata = {
  title: "Payment Advice | QCC Attendance",
  description: "Manage leave payment advices and memos",
}

export default async function PaymentAdvicePage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login")
  }

  // Get user profile to check permissions
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("id, role, first_name, last_name, email, department_id, assigned_location_id")
    .eq("id", user.id)
    .single()

  if (!profile) {
    return <div className="p-8 text-center">Profile not found</div>
  }

  // Check if user has permission to access payment advice
  // HR Manager, HR Executive, HR Officer, Admin roles can access
  const roleNorm = String(profile.role || "").toLowerCase().replace(/[\s-]+/g, "_")
  const allowedRoles = [
    "admin",
    "hr_manager",
    "hr_executive",
    "hr_officer",
    "hr_leave_office",
    "hr_office",
    "hr",
    "manager_hr",
    "director_hr",
    "hr_director",
    "it_admin",
    "regional_manager",
  ]

  if (!allowedRoles.includes(roleNorm)) {
    return (
      <div className="p-8 text-center">
        <h1 className="text-2xl font-bold text-red-600 mb-4">Access Denied</h1>
        <p className="text-gray-600">You do not have permission to access the Payment Advice section.</p>
        <p className="text-sm text-gray-500 mt-2">Your role: {profile.role}</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <PaymentAdviceClient />
    </div>
  )
}
