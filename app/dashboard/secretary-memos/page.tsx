import { createClientAndGetUser, createAdminClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { SecretaryMemosClient } from "./secretary-memos-client"
import { regionalSecretaryRoles, resolveMemoVisibilityScope } from "@/lib/hr-workflow"

export default async function SecretaryMemosPage() {
  const { user, authError } = await createClientAndGetUser()
  if (authError || !user) redirect("/auth/login")

  const admin = await createAdminClient()

  const { data: profile } = await admin
    .from("user_profiles")
    .select("id, role, first_name, last_name, profile_image_url, departments(name)")
    .eq("id", user.id)
    .maybeSingle()

  // The proxy has already validated the role. Administrators and secretaries
  // may use the memo console without being sent back to the login screen.
  const normalizedRole = String(profile?.role || "").toLowerCase().replace(/[\s-]+/g, "_")
  const canUseMemoConsole = regionalSecretaryRoles(normalizedRole) || ["hr_records", "hr_records_officer", "hr_records_manager"].includes(normalizedRole)
  if (!profile || !canUseMemoConsole) {
    redirect("/dashboard/attendance")
  }

  const visibility = await resolveMemoVisibilityScope(admin, user.id, normalizedRole)
  const scopedStaffIds = visibility.staffIds
  const isHrRecords = ["hr_records", "hr_records_officer", "hr_records_manager"].includes(normalizedRole)

  // Fetch approved loan memos (HR Executive approved stage and above)
  // Includes: awaiting_director_hr (HR signed, awaiting MD), approved_director (MD approved), staff_receiving_funds, partially_recovered
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
        geofence_locations!user_profiles_assigned_location_id_fkey(name)
      )
    `)
    .in("status", ["awaiting_director_hr", "approved_director", "staff_receiving_funds", "partially_recovered", "fully_recovered"])
    .order("created_at", { ascending: false })
    .limit(300)

  const visibleLoanMemos = scopedStaffIds
    ? (loanMemos || []).filter((memo: any) => memo.user_id && scopedStaffIds.includes(memo.user_id))
    : loanMemos || []

  // Fetch approved leave memos from leave_plan_requests (the correct table)
  const { data: rawLeaveMemos } = await admin
    .from("leave_plan_requests")
    .select("id, leave_type_key, status, preferred_start_date, preferred_end_date, reason, created_at, hr_approved_at, memo_token, user_id")
    .in("status", ["hod_approved", "hr_approved", "approved", "regional_manager_approved"])
    .order("created_at", { ascending: false })
    .limit(300)

  const visibleRawLeaveMemos = scopedStaffIds
    ? (rawLeaveMemos || []).filter((memo: any) => memo.user_id && scopedStaffIds.includes(memo.user_id))
    : rawLeaveMemos || []

  // Fetch user profiles for those leave memos separately
  const leaveUserIds = [...new Set(visibleRawLeaveMemos.map((l: any) => l.user_id).filter(Boolean))]
  const { data: leaveProfiles } = leaveUserIds.length > 0
    ? await admin
        .from("user_profiles")
        .select("id, first_name, last_name, employee_id, profile_image_url, department_id, departments(name)")
        .in("id", leaveUserIds)
    : { data: [] }

  const leaveProfileMap = new Map((leaveProfiles || []).map((p: any) => [p.id, p]))

  // Normalise to the shape the client expects
  const leaveMemos = visibleRawLeaveMemos.map((leave: any) => ({
    id: leave.id,
    leave_type: leave.leave_type_key,
    status: leave.status,
    start_date: leave.preferred_start_date,
    end_date: leave.preferred_end_date,
    reason: leave.reason,
    created_at: leave.created_at,
    hr_approved_at: leave.hr_approved_at,
    memo_token: leave.memo_token,
    user_id: leave.user_id,
    user_profiles: leaveProfileMap.get(leave.user_id) || null,
  }))

  // Fetch all MD-stamped/approved loan memos (approved_director status with md_approved_at set)
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
    .eq("status", "approved_director")
    .not("md_approved_at", "is", null)
    .order("md_approved_at", { ascending: false })
    .limit(300)

  const visibleApprovedLoanMemos = scopedStaffIds
    ? (approvedLoanMemos || []).filter((memo: any) => memo.user_id && scopedStaffIds.includes(memo.user_id))
    : approvedLoanMemos || []

  // MD Approved tab: ONLY loans that the MD has actually stamped (md_approved_at set)
  // and leave payment advice that the MD has approved (md_approved payment_advice_memos)
  // Do NOT include regular leave memos here — those belong in the Leave Memos tab only
  const approvedMemos = visibleApprovedLoanMemos.map((loan: any) => {
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
  })

  return (
    <SecretaryMemosClient
      profile={profile}
      loanMemos={visibleLoanMemos}
      leaveMemos={leaveMemos || []}
      approvedMemos={approvedMemos}
      regionalScope={visibility.isRegional}
    />
  )
}
