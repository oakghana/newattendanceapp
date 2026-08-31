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
    .select("id, role, first_name, last_name, profile_image_url, region_id, assigned_location_id, departments(name)")
    .eq("id", user.id)
    .maybeSingle()

  // The proxy has already validated the role. Administrators and secretaries
  // may use the memo console without being sent back to the login screen.
  const normalizedRole = String(profile?.role || "").toLowerCase().replace(/[\s-]+/g, "_")
  const canUseMemoConsole = regionalSecretaryRoles(normalizedRole) || ["hr_records", "hr_records_officer", "hr_records_manager", "regional_manager"].includes(normalizedRole)
  if (!profile || !canUseMemoConsole) {
    redirect("/dashboard/attendance")
  }

  const visibility = await resolveMemoVisibilityScope(admin, user.id, normalizedRole)
  const effectiveVisibility = normalizedRole === "regional_manager"
    ? { ...visibility, regionIds: profile.region_id ? [profile.region_id] : [], locationIds: profile.assigned_location_id ? [profile.assigned_location_id] : [] }
    : visibility
  const scopedStaffIds = effectiveVisibility.staffIds
  const isHrRecords = ["hr_records", "hr_records_officer", "hr_records_manager"].includes(normalizedRole)
  const isRegionalManager = normalizedRole === "regional_manager"
  const isRhedOffice = ["regional_hr_leave_office", "regional_leave_office"].includes(normalizedRole)

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
    .in("status", [
    "awaiting_director_hr",
    "approved_director",
    "pending_hr_records_reference",
    "referenced",
    "staff_receiving_funds",
    "partially_recovered",
    "fully_recovered",
  ])
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

  // Fetch every loan memo the MD has approved, including requests that have
  // already moved through HR Records and later disbursement/recovery stages.
  // The old approved_director-only filter hid a memo as soon as HR Records
  // saved the official reference and advanced its status.
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
    .in("status", [
      "approved_director",
      "pending_hr_records_reference",
      "referenced",
      "staff_receiving_funds",
      "partially_recovered",
      "fully_recovered",
    ])
    .not("md_approved_at", "is", null)
    .order("md_approved_at", { ascending: false })
    .limit(300)

  const visibleApprovedLoanMemos = scopedStaffIds
    ? (approvedLoanMemos || []).filter((memo: any) => memo.user_id && scopedStaffIds.includes(memo.user_id))
    : approvedLoanMemos || []

  // MD Approved tab: ONLY loans that the MD has actually stamped (md_approved_at set)
  // and leave payment advice that the MD has approved (md_approved payment_advice_memos)
  // Do NOT include regular leave memos here — those belong in the Leave Memos tab only
  const { data: regionalTransportRows } = await admin
    .from("transport_requests")
    .select("id, reference_number, purpose, origin, destination, event_date, passenger_count, workflow_stage, status, created_at, memo_reference, memo_date, memo_subject, memo_body, memo_amendments, assigned_region_id, linked_district_id, origin_location_id")
    .eq("request_type", "regional_transport")
    .order("created_at", { ascending: false })
    .limit(300)

  const visibleRegionalTransportRows = (regionalTransportRows || []).filter((row: any) => {
    const isApproved = row.status === "approved" || row.workflow_stage === "hr_records_review"
    // HR Records is the central memo office: it must see every regional
    // transport request, including pending/not-approved requests.
    if (isHrRecords) return true
    // RHED office secretaries see approved regional transport memos across the region.
    if (isRhedOffice) return isApproved && Boolean((row.assigned_region_id && effectiveVisibility.regionIds.includes(row.assigned_region_id)) || (row.origin_location_id && effectiveVisibility.locationIds.includes(row.origin_location_id)))
    // Regional users and managers see approved requests from their location only.
    return isApproved && Boolean(row.origin_location_id && effectiveVisibility.locationIds.includes(row.origin_location_id))
  })

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
      regionalTransportMemos={visibleRegionalTransportRows}
      regionalScope={visibility.isRegional}
    />
  )
}
