import { createClientAndGetUser, createAdminClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { SecretaryMemosClient } from "./secretary-memos-client"

export default async function SecretaryMemosPage() {
  const { user, authError } = await createClientAndGetUser()
  if (authError || !user) redirect("/auth/login")

  const admin = await createAdminClient()

  const { data: profile } = await admin
    .from("user_profiles")
    .select("id, role, first_name, last_name, profile_image_url, departments(name)")
    .eq("id", user.id)
    .maybeSingle()

  // The proxy has already validated the role — just render the client without redirects
  if (!profile || profile.role !== "secretary") redirect("/auth/login")

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
      user_id,
      user_profiles!user_id (
        first_name,
        last_name,
        employee_id,
        profile_image_url,
        departments(name),
        geofence_locations(name)
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
        profile_image_url,
        departments(name)
      )
    `)
    .in("status", ["approved", "hr_approved", "hod_approved"])
    .order("created_at", { ascending: false })
    .limit(300)

  // Fetch all MD-stamped/approved loan memos (any post-MD-approval status)
  // Include user_profiles join to resolve staff names when staff_full_name is missing
  const { data: approvedLoanMemos } = await admin
    .from("loan_requests")
    .select(`
      id,
      request_number,
      loan_type_label,
      fixed_amount,
      status,
      created_at,
      md_approved_at,
      md_approved_by_name,
      staff_full_name,
      staff_number,
      user_id,
      user_profiles!user_id (
        first_name,
        last_name,
        employee_id,
        profile_image_url
      )
    `)
    .in("status", ["md_approved", "approved_director", "staff_receiving_funds", "partially_recovered", "fully_recovered"])
    .not("md_approved_at", "is", null)
    .order("md_approved_at", { ascending: false })
    .limit(300)

  // Fetch MD approved leave memos (all final approved leave)
  const { data: approvedLeaveMemos } = await admin
    .from("leave_requests")
    .select(`
      id,
      leave_type,
      status,
      start_date,
      end_date,
      created_at,
      user_id,
      user_profiles!user_id (
        first_name,
        last_name,
        employee_id
      )
    `)
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .limit(300)

  // Combine approved memos
  const approvedMemos = [
    ...(approvedLoanMemos || []).map((loan: any) => {
      const profile = loan.user_profiles
      const resolvedName =
        loan.staff_full_name?.trim() ||
        (`${profile?.first_name || ""} ${profile?.last_name || ""}`.trim()) ||
        "Unknown Staff"
      const resolvedStaffNo = loan.staff_number || profile?.employee_id || "—"
      return {
        id: loan.id,
        request_number: loan.request_number,
        type: "loan" as const,
        loan_type_label: loan.loan_type_label,
        staff_full_name: resolvedName,
        staff_number: resolvedStaffNo,
        fixed_amount: loan.fixed_amount,
        md_approved_at: loan.md_approved_at,
        md_approved_by_name: loan.md_approved_by_name,
      }
    }),
    ...(approvedLeaveMemos || []).map((leave: any) => ({
      id: leave.id,
      request_number: leave.id.slice(0, 8),
      type: "leave" as const,
      leave_type: leave.leave_type,
      staff_full_name: `${leave.user_profiles?.first_name} ${leave.user_profiles?.last_name}`.trim(),
      staff_number: leave.user_profiles?.employee_id,
      start_date: leave.start_date,
      end_date: leave.end_date,
      md_approved_at: leave.created_at,
      md_approved_by_name: null,
    })),
  ]

  return (
    <SecretaryMemosClient
      profile={profile}
      loanMemos={loanMemos || []}
      leaveMemos={leaveMemos || []}
      approvedMemos={approvedMemos}
    />
  )
}
