import { NextResponse } from "next/server"
import { createAdminClient, createClientAndGetUser } from "@/lib/supabase/server"
import {
  canDoAccounts,
  canDoCommittee,
  canDoDirectorHr,
  canDoHrOffice,
  canDoLoanOffice,
  isAdminRole,
  isSchemaIssue,
  normalizeRole,
} from "@/lib/loan-workflow"
import { deriveStaffCategoryFromPosition } from "@/lib/annual-leave-entitlement"

const HOD_AUTO_ADVANCE_DAYS = 3
const POST_LOAN_OFFICE_DELAY_DAYS = 5
const ADMIN_DB_ROLE_ALIASES = ["admin", "super_admin", "god"]
// Note: it_admin is NOT included - IT Admin users should only see My Loans and My Tasks tabs

async function notifyUsers(admin: any, userIds: string[], title: string, message: string, type = "loan_update", data: any = {}) {
  if (!userIds.length) return
  await admin.from("staff_notifications").insert(
    userIds.map((uid) => ({ recipient_id: uid, title, message, type, data, is_read: false })),
  )
}

async function autoAdvanceStaleHodRequests(admin: any) {
  const cutoff = new Date(Date.now() - HOD_AUTO_ADVANCE_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const { data: stale, error } = await admin
    .from("loan_requests")
    .select("id, user_id, request_number, submitted_at")
    .eq("status", "pending_hod")
    .lte("submitted_at", cutoff)

  if (error || !stale || stale.length === 0) return

  const ids = stale.map((r: any) => r.id)
  const nowIso = new Date().toISOString()

  await admin
    .from("loan_requests")
    .update({
      status: "hod_approved",
      hod_review_note: `Auto-approved after ${HOD_AUTO_ADVANCE_DAYS} days with no HOD action.`,
      hod_decision_at: nowIso,
      updated_at: nowIso,
    })
    .in("id", ids)

  await admin.from("loan_request_timeline").insert(
    stale.map((row: any) => ({
      loan_request_id: row.id,
      actor_id: null,
      actor_role: "system",
      action_key: "hod_auto_approved",
      from_status: "pending_hod",
      to_status: "hod_approved",
      note: `Auto-approved after ${HOD_AUTO_ADVANCE_DAYS} days with no HOD action.`,
      metadata: { sla_days: HOD_AUTO_ADVANCE_DAYS },
      created_at: nowIso,
    })),
  )

  const { data: loanOfficeUsers } = await admin
    .from("user_profiles")
    .select("id")
    .in("role", ["loan_officer", "hr_officer", "director_hr", "hr_director", "loan_office", "manager_hr", ...ADMIN_DB_ROLE_ALIASES])
    .eq("is_active", true)

  const loanOfficeIds = (loanOfficeUsers || []).map((u: any) => u.id)
  await Promise.all(
    stale.map((row: any) =>
      Promise.all([
        notifyUsers(
          admin,
          [row.user_id],
          "Loan Request Auto-Advanced",
          `Your request ${row.request_number} was automatically advanced to Loan Office after ${HOD_AUTO_ADVANCE_DAYS} days without HOD action.`,
          "loan_hod_auto_approved",
          { request_id: row.id },
        ),
        notifyUsers(
          admin,
          loanOfficeIds,
          "Loan Request Auto-Advanced to Loan Office",
          `Request ${row.request_number} has been auto-approved at HOD stage and is ready for Loan Office processing.`,
          "loan_hod_auto_approved_queue",
          { request_id: row.id },
        ),
      ]),
    ),
  )
}

function stageOwnerForDelay(row: any) {
  const status = String(row.status || "")
  if (status === "sent_to_accounts") {
    return { ownerId: row.accounts_reviewer_id || null, ownerRole: "accounts", stage: "Accounts FD" }
  }
  if (status === "awaiting_committee") {
    return { ownerId: row.committee_reviewer_id || null, ownerRole: "committee", stage: "Committee" }
  }
  if (status === "awaiting_hr_terms") {
    return { ownerId: row.hr_officer_id || null, ownerRole: "hr_office", stage: "HR Terms" }
  }
  if (status === "awaiting_director_hr") {
    return { ownerId: row.director_hr_id || null, ownerRole: "director_hr", stage: "Director HR" }
  }
  return { ownerId: null, ownerRole: "unknown", stage: status || "Unknown" }
}

async function broadcastDelayedPostLoanOfficeRequests(admin: any) {
  const cutoffIso = new Date(Date.now() - POST_LOAN_OFFICE_DELAY_DAYS * 24 * 60 * 60 * 1000).toISOString()

  const { data: staleRows, error } = await admin
    .from("loan_requests")
    .select("id, request_number, status, updated_at, accounts_reviewer_id, committee_reviewer_id, hr_officer_id, director_hr_id")
    .in("status", ["sent_to_accounts", "awaiting_committee", "awaiting_hr_terms", "awaiting_director_hr"])
    .lte("updated_at", cutoffIso)

  if (error || !staleRows || staleRows.length === 0) return

  const staleIds = staleRows.map((r: any) => r.id)
  const recentCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data: recentBroadcasts } = await admin
    .from("loan_request_timeline")
    .select("loan_request_id, from_status")
    .eq("action_key", "process_delay_broadcast")
    .in("loan_request_id", staleIds)
    .gte("created_at", recentCutoff)

  const broadcastedKeys = new Set(
    (recentBroadcasts || []).map((b: any) => `${b.loan_request_id}:${String(b.from_status || "")}`),
  )

  const ownerIds = Array.from(
    new Set(
      staleRows
        .map((r: any) => stageOwnerForDelay(r).ownerId)
        .filter(Boolean),
    ),
  ) as string[]

  const { data: owners } = ownerIds.length
    ? await admin.from("user_profiles").select("id, first_name, last_name, role").in("id", ownerIds)
    : ({ data: [] } as any)

  const ownerMap = new Map((owners || []).map((o: any) => [o.id, `${o.first_name || ""} ${o.last_name || ""}`.trim() || o.role || "Unknown"]))

  const { data: allUsers } = await admin.from("user_profiles").select("id").eq("is_active", true)
  const allUserIds = (allUsers || []).map((u: any) => u.id)
  if (!allUserIds.length) return

  const nowIso = new Date().toISOString()
  for (const row of staleRows) {
    const key = `${row.id}:${String(row.status || "")}`
    if (broadcastedKeys.has(key)) continue

    const owner = stageOwnerForDelay(row)
    const ownerName = owner.ownerId ? ownerMap.get(owner.ownerId) || "Assigned user" : "Unassigned"
    const message = `Delay broadcast: ${row.request_number} has stayed at ${owner.stage} for more than ${POST_LOAN_OFFICE_DELAY_DAYS} days. Responsible: ${ownerName}.`

    await notifyUsers(
      admin,
      allUserIds,
      "Loan Process Delay Broadcast",
      message,
      "loan_process_delay_broadcast",
      { request_id: row.id, status: row.status, owner_id: owner.ownerId },
    )

    await admin.from("loan_request_timeline").insert({
      loan_request_id: row.id,
      actor_id: null,
      actor_role: "system",
      action_key: "process_delay_broadcast",
      from_status: row.status,
      to_status: row.status,
      note: message,
      metadata: {
        days_stuck: POST_LOAN_OFFICE_DELAY_DAYS,
        owner_id: owner.ownerId,
        owner_role: owner.ownerRole,
      },
      created_at: nowIso,
    })
  }
}

export async function GET() {
  try {
    const admin = await createAdminClient()

    // Use createClientAndGetUser so stale refresh tokens are cleared gracefully
    // instead of returning a hard 401 that breaks the whole loan dashboard
    const { user, authError } = await createClientAndGetUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: profile, error: profileError } = await admin
      .from("user_profiles")
      .select("id, first_name, last_name, employee_id, email, role, position, department_id, assigned_location_id, departments(name, code), geofence_locations!assigned_location_id(name, address, districts(name))")
      .eq("id", user.id)
      .maybeSingle()

    if (profileError || !profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    // Fetch welfare fields separately — these columns may not yet exist in all deployments,
    // so we isolate this query so a missing column never breaks the main profile load.
    // Extract welfare fields from main profile (since the isolated query might not find columns)
    // Also try a separate query as fallback in case those fields are in a different table
    let welfareRow: { staff_category?: string | null; years_of_service?: number | null; date_of_appointment?: string | null } = {}
    try {
      // First, extract from the main profile that was already fetched
      const profileData = profile as any
      if (profileData) {
        welfareRow.staff_category = profileData.staff_category
        welfareRow.years_of_service = profileData.years_of_service
        welfareRow.date_of_appointment = profileData.date_of_appointment
      }
      
      // If we didn't get them from main profile, try an isolated query
      if (!welfareRow.staff_category && !welfareRow.years_of_service && !welfareRow.date_of_appointment) {
        const { data: wData } = await admin
          .from("user_profiles")
          .select("*")
          .eq("id", user.id)
          .maybeSingle()
        if (wData) {
          welfareRow.staff_category = wData.staff_category
          welfareRow.years_of_service = wData.years_of_service
          welfareRow.date_of_appointment = wData.date_of_appointment
        }
      }
    } catch (e) { 
      console.log("[v0] Welfare fetch fallback error:", e)
    }

    // Pull welfare fields from the isolated welfare query result
    let staffCategory: string | null = welfareRow.staff_category ?? null
    let yearsOfService: number | null = welfareRow.years_of_service ?? null
    let dateOfAppointment: string | null = welfareRow.date_of_appointment ?? null

    console.log("[v0] Workflow API - Welfare row data:", {
      years_of_service: welfareRow.years_of_service,
      date_of_appointment: welfareRow.date_of_appointment,
      staff_category: welfareRow.staff_category,
    })

    // If DB has no years_of_service (null or 0) but has date_of_appointment, auto-calculate it
    if ((!yearsOfService || yearsOfService === 0) && dateOfAppointment) {
      const apptDate = new Date(dateOfAppointment)
      if (!isNaN(apptDate.getTime())) {
        const calculated = Math.floor(
          (Date.now() - apptDate.getTime()) / (365.25 * 24 * 3600 * 1000)
        )
        console.log("[v0] Workflow API - Calculated YoS from date:", { dateOfAppointment, calculated })
        // Only use calculated value if it's reasonable (> 0 and < 100 years)
        if (calculated > 0 && calculated < 100) {
          yearsOfService = calculated
        }
      }
    }
    
    // If still no value and we have a date_of_appointment but calculation failed, try again
    if (!yearsOfService && dateOfAppointment) {
      try {
        const apptDate = new Date(dateOfAppointment)
        const now = new Date()
        const calculated = Math.floor(
          (now.getTime() - apptDate.getTime()) / (365.25 * 24 * 3600 * 1000)
        )
        console.log("[v0] Workflow API - Fallback YoS calculation:", { calculated })
        if (calculated > 0) yearsOfService = calculated
      } catch (e) { 
        console.log("[v0] Workflow API - Fallback calc error:", e)
      }
    }
    
    console.log("[v0] Workflow API - Final yearsOfService:", yearsOfService)

    // Normalise staffCategory to Title Case and only derive from position when NOT explicitly set in DB
    if (staffCategory) {
      const raw = staffCategory.toLowerCase().trim()
      if (raw === "senior" || raw === "senior staff") staffCategory = "Senior"
      else if (raw === "junior" || raw === "junior staff") staffCategory = "Junior"
      else staffCategory = staffCategory.charAt(0).toUpperCase() + staffCategory.slice(1).toLowerCase()
    } else {
      // Nothing stored — try to derive from position/rank
      const position = (profile as any)?.position || null
      const rank = (profile as any)?.rank || null
      const derived = deriveStaffCategoryFromPosition(position, rank)
      if (derived) {
        staffCategory = derived.charAt(0).toUpperCase() + derived.slice(1)
      }
    }

    const role = normalizeRole((profile as any).role)
    const deptName = (profile as any)?.departments?.name || null
    const deptCode = (profile as any)?.departments?.code || null
    const managerDepartmentId = String((profile as any)?.department_id || "")
    const managerLocationId = String((profile as any)?.assigned_location_id || "")
    const isRegionalManager = role === "regional_manager"
    const isDepartmentHead = role === "department_head"

    // Fetch ALL linked staff for this HOD (not just one)
    let linkedStaffIds: string[] = []
    if (isRegionalManager || isDepartmentHead) {
      const { data: linkageRows } = await admin
        .from("loan_hod_linkages")
        .select("staff_user_id")
        .eq("hod_user_id", user.id)
        .limit(5000)
      linkedStaffIds = (linkageRows || []).map((row: any) => row.staff_user_id).filter(Boolean)
    }
    const reviewerScopedStaffIds = Array.from(new Set(linkedStaffIds))

    // Fetch staff linked to THIS user
    // If user is HOD: fetch all STAFF linked to them (to show their requests in myTasks)
    // If user is STAFF: fetch all HODs linked to them (to broadcast requests to all HODs)
    let linkedHodIds: string[] = []
    let staffLinkedToHodIds: string[] = []
    
    if (isRegionalManager || isDepartmentHead || role === "admin" || (permissions.hod && !isRegionalManager && !isDepartmentHead)) {
      // User IS a HOD - fetch all STAFF linked to them
      const { data: staffLinkageRows } = await admin
        .from("loan_hod_linkages")
        .select("staff_user_id")
        .eq("hod_user_id", user.id)
        .limit(5000)
      staffLinkedToHodIds = (staffLinkageRows || []).map((row: any) => row.staff_user_id).filter(Boolean)
    } else {
      // User is STAFF - fetch all HODs linked to them
      const { data: hodLinkageRows } = await admin
        .from("loan_hod_linkages")
        .select("hod_user_id")
        .eq("staff_user_id", user.id)
        .limit(5000)
      linkedHodIds = (hodLinkageRows || []).map((row: any) => row.hod_user_id).filter(Boolean)
    }
    const staffLinkedHodIds = Array.from(new Set(staffLinkedToHodIds))

    const loanTypesWithTermsQuery = () =>
      admin
        .from("loan_types")
        .select("loan_key, loan_label, category, requires_committee, requires_fd_check, min_fd_score, min_qualification_note, fixed_amount, max_amount, loan_terms, default_recovery_months, sort_order")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })

    const loanTypesLegacyQuery = () =>
      admin
        .from("loan_types")
        .select("loan_key, loan_label, category, requires_committee, requires_fd_check, min_fd_score, min_qualification_note, fixed_amount, max_amount, sort_order")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })

    const [typesRes, myRes, myHodLinkRes] = await Promise.all([
      loanTypesWithTermsQuery(),
      admin
        .from("loan_requests")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
      admin
        .from("loan_hod_linkages")
        .select("hod_user_id")
        .eq("staff_user_id", user.id)
        .limit(1)
        .maybeSingle(),
    ])

    let linkedHodName: string | null = null
    if (myHodLinkRes.data?.hod_user_id) {
      const { data: hodProfile } = await admin
        .from("user_profiles")
        .select("first_name, last_name, position")
        .eq("id", myHodLinkRes.data.hod_user_id)
        .maybeSingle()
      if (hodProfile) {
        const name = `${hodProfile.first_name || ""} ${hodProfile.last_name || ""}`.trim()
        linkedHodName = hodProfile.position ? `${name} (${hodProfile.position})` : name || null
      }
    }

    const { data: directorApproverRows } = await admin
      .from("user_profiles")
      .select("id, first_name, last_name, position, role")
      .in("role", ["director_hr", "manager_hr"])
      .eq("is_active", true)
      .order("first_name", { ascending: true })

    const directorApprovers = (directorApproverRows || []).map((row: any) => ({
      id: String(row.id),
      full_name: `${row.first_name || ""} ${row.last_name || ""}`.trim() || String(row.role || "Approver"),
      position: row.position || null,
      role: row.role || null,
    }))

    let resolvedTypesRes: any = typesRes
    if (resolvedTypesRes.error && isSchemaIssue(resolvedTypesRes.error)) {
      const legacyTypesRes = await loanTypesLegacyQuery()
      if (!legacyTypesRes.error) {
        resolvedTypesRes = {
          data: (legacyTypesRes.data || []).map((row: any) => ({
            ...row,
            loan_terms: null,
            default_recovery_months: null,
          })),
          error: null,
        }
      }
    }

    if (resolvedTypesRes.error && isSchemaIssue(resolvedTypesRes.error)) {
      const viewAllTabs = isAdminRole(role)
      return NextResponse.json(
        {
          degraded: true,
          warning: "Loan module tables are not available yet. Run scripts/051_loan_module_workflow.sql in Supabase SQL Editor.",
          profile: {
            id: (profile as any).id,
            firstName: (profile as any).first_name,
            lastName: (profile as any).last_name,
            employeeId: (profile as any).employee_id,
            email: (profile as any).email || user.email,
            role: (profile as any).role,
            position: (profile as any).position,
            staffCategory: null,
            yearsOfService: null,
            dateOfAppointment: null,
            departmentId: (profile as any).department_id,
            assignedLocationId: (profile as any).assigned_location_id,
            departmentName: (profile as any)?.departments?.name || null,
            assignedLocationName: (profile as any)?.geofence_locations?.name || null,
            assignedLocationAddress: (profile as any)?.geofence_locations?.address || null,
            assignedDistrictName: (profile as any)?.geofence_locations?.districts?.name || null,
            linkedHodName: null,
            currentHodProfile: null,
          },
          role,
          loanTypes: [],
          myRequests: [],
          myTimelines: [],
          directorApprovers,
          inbox: {
            hod: [],
            loanOffice: [],
            accounts: [],
            accountsSigned: [],
            committee: [],
            hrOffice: [],
            directorHr: [],
            directorGoodFd: [],
            allLoans: [],
          },
          permissions: {
            hod: isAdminRole(role) || ["department_head", "regional_manager"].includes(role),
            loanOffice: canDoLoanOffice(role, deptName, deptCode),
            accounts: canDoAccounts(role, deptName, deptCode),
            committee: canDoCommittee(role),
            hrOffice: canDoHrOffice(role, deptName, deptCode),
            directorHr: canDoDirectorHr(role, deptName, deptCode),
            viewAllTabs,
            allLoans: isAdminRole(role) || ["loan_office", "accounts", "director_hr", "manager_hr", "hr_office", "loan_committee", "committee"].includes(role),
          },
        },
        { status: 200 },
      )
    }

    if (resolvedTypesRes.error) throw resolvedTypesRes.error
    if (myRes.error) throw myRes.error

    await autoAdvanceStaleHodRequests(admin)
    await broadcastDelayedPostLoanOfficeRequests(admin)

    const viewAllTabs = isAdminRole(role)

    const permissions = {
      hod: isAdminRole(role) || ["department_head", "regional_manager"].includes(role),
      loanOffice: canDoLoanOffice(role, deptName, deptCode),
      accounts: canDoAccounts(role, deptName, deptCode),
      committee: canDoCommittee(role),
      hrOffice: canDoHrOffice(role, deptName, deptCode),
      directorHr: canDoDirectorHr(role, deptName, deptCode),
      viewAllTabs,
      allLoans: isAdminRole(role) || ["loan_office", "accounts", "director_hr", "manager_hr", "hr_office", "loan_committee", "committee"].includes(role),
    }

    // HOD query: include requests explicitly assigned to this HOD, plus linked-staff fallback for legacy data.
    // ALSO: If staff has multiple linked HODs, broadcast to ALL of them (not just primary)
    const hodPromise: Promise<any> = (async () => {
      if (!(permissions.hod || viewAllTabs)) return { data: [], error: null }
      if (viewAllTabs || !["department_head", "regional_manager"].includes(role)) {
        return admin
          .from("loan_requests")
          .select("*")
          .eq("status", "pending_hod")
          .order("created_at", { ascending: false })
      }

      const scopedFilter = reviewerScopedStaffIds.length > 0
        ? `,user_id.in.(${reviewerScopedStaffIds.join(",")})`
        : ""

      // For HOD-role users: also include requests where they're one of multiple linked HODs
      // This ensures all linked HODs see staff requests (multi-HOD support)
      const allLinkedHodFilter = staffLinkedHodIds.length > 0
        ? `,hod_reviewer_id.in.(${[user.id, ...staffLinkedHodIds].join(",")})`
        : ""

      return admin
        .from("loan_requests")
        .select("*")
        .eq("status", "pending_hod")
        .or(`hod_reviewer_id.eq.${user.id}${scopedFilter}${allLinkedHodFilter}`)
        .order("created_at", { ascending: false })
    })()

    const showHod = permissions.hod || viewAllTabs
    const showLoanOffice = permissions.loanOffice || viewAllTabs
    const showAccounts = permissions.accounts || viewAllTabs
    const showCommittee = permissions.committee || viewAllTabs
    const showHrOffice = permissions.hrOffice || viewAllTabs
    const showDirectorHr = permissions.directorHr || viewAllTabs

    // HR loan office (loan_officer + viewAllTabs) sees all non-terminal loans
    // Includes: awaiting_hr_terms (normal flow) + sent_to_hr_office (FD-exempt loans like Funeral, Insurance, Repair with FD >= 0%)
    const hrOfficeQ: any = !showHrOffice
      ? Promise.resolve({ data: [], error: null })
      : (viewAllTabs && role === "loan_officer")
        ? admin.from("loan_requests").select("*")
            .not("status", "in", '("hod_rejected","director_rejected","rejected_fd","committee_rejected")')
            .order("created_at", { ascending: false })
        : admin.from("loan_requests").select("*").in("status", ["awaiting_hr_terms", "sent_to_hr_office"]).order("created_at", { ascending: false })

    const myRequestIds = (myRes.data || []).map((r: any) => r.id)

    const [hodRes, loanOfficeRes, accountsRes, accountsSignedRes, committeeRes, hrRes, directorRes, directorGoodFdRes, allLoansRes, timelinesRes, myTasksRes] = await Promise.all([
      hodPromise,
      showLoanOffice
        ? admin.from("loan_requests").select("*").eq("status", "hod_approved").order("created_at", { ascending: false })
        : Promise.resolve({ data: [], error: null } as any),
      showAccounts
        ? admin.from("loan_requests").select("*").eq("status", "sent_to_accounts").order("created_at", { ascending: false })
        : Promise.resolve({ data: [], error: null } as any),
      showAccounts
        ? admin.from("loan_requests").select("*").eq("status", "approved_director").order("created_at", { ascending: false })
        : Promise.resolve({ data: [], error: null } as any),
      showCommittee
        ? admin.from("loan_requests").select("*").eq("status", "awaiting_committee").order("created_at", { ascending: false })
        : Promise.resolve({ data: [], error: null } as any),
      hrOfficeQ,
      showDirectorHr
        ? admin.from("loan_requests").select("*").eq("status", "awaiting_director_hr").order("created_at", { ascending: false })
        : Promise.resolve({ data: [], error: null } as any),
      showDirectorHr
        ? admin
            .from("loan_requests")
            .select("*")
            .eq("fd_good", true)
            .in("status", ["awaiting_hr_terms", "awaiting_director_hr"])
            .order("updated_at", { ascending: false })
        : Promise.resolve({ data: [], error: null } as any),
      (viewAllTabs || permissions.allLoans)
        ? admin.from("loan_requests").select("*").order("created_at", { ascending: false })
        : (isRegionalManager || isDepartmentHead)
          ? admin
              .from("loan_requests")
              .select("*")
              .or(
                `hod_reviewer_id.eq.${user.id}${
                  reviewerScopedStaffIds.length > 0 ? `,user_id.in.(${reviewerScopedStaffIds.join(",")})` : ""
                }`,
              )
              .order("created_at", { ascending: false })
          : Promise.resolve({ data: [], error: null } as any),
      myRequestIds.length > 0
        ? admin.from("loan_request_timeline").select("*").in("loan_request_id", myRequestIds).order("created_at", { ascending: true })
        : Promise.resolve({ data: [], error: null } as any),
      // myTasks: requests where user is explicitly assigned as reviewer
      admin
        .from("loan_requests")
        .select("*")
        .or(
          [
            `hod_reviewer_id.eq.${user.id}`,
            `loan_office_reviewer_id.eq.${user.id}`,
            `accounts_reviewer_id.eq.${user.id}`,
            `committee_reviewer_id.eq.${user.id}`,
            `hr_officer_id.eq.${user.id}`,
            `director_hr_id.eq.${user.id}`,
          ].join(","),
        )
        .order("updated_at", { ascending: false }),
    ])

    // After explicit tasks are fetched, get linked staff tasks if user is HOD
    let linkedStaffRes = { data: [], error: null } as any
    if ((permissions.hod || viewAllTabs) && staffLinkedHodIds && staffLinkedHodIds.length > 0) {
      linkedStaffRes = await admin
        .from("loan_requests")
        .select("*")
        .in("user_id", staffLinkedHodIds)
        .eq("status", "pending_hod")
        .order("created_at", { ascending: false })
    }

    // Merge explicit tasks with linked staff tasks and deduplicate
    if (linkedStaffRes.data && linkedStaffRes.data.length > 0 && myTasksRes.data) {
      const merged = [...myTasksRes.data, ...linkedStaffRes.data]
      const uniqueMap = new Map(merged.map((r: any) => [r.id, r]))
      const uniqueTasks = Array.from(uniqueMap.values()).sort((a: any, b: any) => 
        new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime()
      )
      myTasksRes.data = uniqueTasks
    }

    const responses = [hodRes, loanOfficeRes, accountsRes, accountsSignedRes, committeeRes, hrRes, directorRes, directorGoodFdRes, allLoansRes, timelinesRes, myTasksRes]
    const schemaError = responses.find((r: any) => r?.error && isSchemaIssue(r.error))
    if (schemaError) {
      return NextResponse.json(
        {
          degraded: true,
          warning: "Loan module schema is not ready. Run scripts/051_loan_module_workflow.sql and refresh.",
          profile,
          role,
          permissions,
          loanTypes: typesRes.data || [],
          myRequests: myRes.data || [],
          myTimelines: [],
          directorApprovers,
          inbox: {
            hod: [],
            loanOffice: [],
            accounts: [],
            accountsSigned: [],
            committee: [],
            hrOffice: [],
            directorHr: [],
            directorGoodFd: [],
            allLoans: [],
          },
        },
        { status: 200 },
      )
    }

    for (const res of responses) {
      if (res?.error) throw res.error
    }

    // Build a staff profile map for everyone appearing in workflow rows.
    const allInboxRows: any[] = [
      ...(hodRes.data || []),
      ...(loanOfficeRes.data || []),
      ...(accountsRes.data || []),
      ...(accountsSignedRes.data || []),
      ...(committeeRes.data || []),
      ...(hrRes.data || []),
      ...(directorRes.data || []),
      ...(directorGoodFdRes.data || []),
      ...(allLoansRes.data || []),
      ...(myRes.data || []),
    ]
    const uniqueUserIds = Array.from(new Set(allInboxRows.map((r: any) => r.user_id).filter(Boolean))) as string[]
    let staffProfileMap: Map<string, any> = new Map()
    if (uniqueUserIds.length > 0) {
      const { data: staffProfiles } = await admin
        .from("user_profiles")
        .select("id, first_name, last_name, employee_id, position, email, assigned_location_id, geofence_locations!assigned_location_id(name, address, districts(name))")
        .in("id", uniqueUserIds)
      for (const sp of staffProfiles || []) {
        staffProfileMap.set(sp.id, sp)
      }
    }
    const attachName = (rows: any[]) =>
      rows.map((r: any) => {
        const sp = staffProfileMap.get(r.user_id)
        const fullName = sp ? `${sp.first_name || ""} ${sp.last_name || ""}`.trim() : null
        return {
          ...r,
          staff_full_name: fullName || r.staff_full_name || null,
          corporate_email: sp?.email || r.corporate_email || null,
          staff_number: sp?.employee_id || r.staff_number || null,
          staff_rank: sp?.position || r.staff_rank || null,
          staff_location_id: sp?.assigned_location_id || r.staff_location_id || null,
          staff_location_name: (sp as any)?.geofence_locations?.name || r.staff_location_name || null,
          staff_location_address: (sp as any)?.geofence_locations?.address || r.staff_location_address || null,
          staff_district_name: (sp as any)?.geofence_locations?.districts?.name || r.staff_district_name || null,
        }
      })

    // Build HOD info map for HR and Director queue rows
    const hrAndDirectorRows: any[] = [
      ...(hrRes.data || []),
      ...(directorRes.data || []),
      ...(directorGoodFdRes.data || []),
    ]
    const uniqueHodReviewerIds = Array.from(
      new Set(hrAndDirectorRows.map((r: any) => r.hod_reviewer_id).filter(Boolean)),
    ) as string[]
    let hodInfoMap: Map<string, { name: string; rank: string; location: string }> = new Map()
    if (uniqueHodReviewerIds.length > 0) {
      const { data: hodProfiles } = await admin
        .from("user_profiles")
        .select("id, first_name, last_name, position, geofence_locations!assigned_location_id(name)")
        .in("id", uniqueHodReviewerIds)
      for (const hp of hodProfiles || []) {
        hodInfoMap.set(hp.id, {
          name: `${hp.first_name || ""} ${hp.last_name || ""}`.trim() || "—",
          rank: hp.position || "—",
          location: (hp as any)?.geofence_locations?.name || "—",
        })
      }
    }
    const attachHodInfo = (rows: any[]) =>
      rows.map((r: any) => {
        const hod = r.hod_reviewer_id ? hodInfoMap.get(r.hod_reviewer_id) : null
        return {
          ...r,
          hod_name: hod?.name || null,
          hod_rank: hod?.rank || null,
          hod_location: hod?.location || null,
        }
      })

    // Build accounts/FD reviewer info map — collect from ALL row pools so that
    // allLoans, myTasks, myRequests etc. always resolve the reviewer name
    const allPooledRows: any[] = [
      ...(accountsRes.data || []),
      ...(accountsSignedRes.data || []),
      ...(allLoansRes.data || []),
      ...(myTasksRes.data || []),
      ...(myRes.data || []),
      ...(hrRes.data || []),
      ...(directorRes.data || []),
      ...(directorGoodFdRes.data || []),
    ]
    const uniqueAccountsReviewerIds = Array.from(
      new Set(allPooledRows.map((r: any) => r.accounts_reviewer_id).filter(Boolean)),
    ) as string[]
    let accountsReviewerMap: Map<string, string> = new Map()
    if (uniqueAccountsReviewerIds.length > 0) {
      const { data: accountsProfiles } = await admin
        .from("user_profiles")
        .select("id, first_name, last_name, position, role")
        .in("id", uniqueAccountsReviewerIds)
      for (const ap of accountsProfiles || []) {
        const fullName = `${ap.first_name || ""} ${ap.last_name || ""}`.trim()
        accountsReviewerMap.set(ap.id, fullName || ap.position || ap.role || "")
      }
    }
    const attachAccountsReviewerName = (rows: any[]) =>
      rows.map((r: any) => ({
        ...r,
        accounts_reviewer_name: r.accounts_reviewer_id
          ? (accountsReviewerMap.get(r.accounts_reviewer_id) || null)
          : null,
      }))

    // Build director HR name map for all rows that have a director_hr_id
    const allRowsForDirector: any[] = [
      ...(allLoansRes.data || []),
      ...(myTasksRes.data || []),
      ...(myRes.data || []),
      ...(directorRes.data || []),
      ...(directorGoodFdRes.data || []),
      ...(hrRes.data || []),
    ]
    const uniqueDirectorIds = Array.from(
      new Set(allRowsForDirector.map((r: any) => r.director_hr_id).filter(Boolean)),
    ) as string[]
    let directorNameMap: Map<string, string> = new Map()
    let directorPositionMap: Map<string, string | null> = new Map()
    if (uniqueDirectorIds.length > 0) {
      const { data: directorProfiles } = await admin
        .from("user_profiles")
        .select("id, first_name, last_name, position")
        .in("id", uniqueDirectorIds)
      for (const dp of directorProfiles || []) {
        const fullName = `${dp.first_name || ""} ${dp.last_name || ""}`.trim()
        directorNameMap.set(dp.id, fullName || "")
        directorPositionMap.set(dp.id, dp.position || "Managing Director")
      }
    }
    // For rows without director_hr_id but status is approved, pick the first active HR director
    let defaultDirectorName = ""
    if (uniqueDirectorIds.length === 0) {
      const { data: defaultDir } = await admin
        .from("user_profiles")
        .select("id, first_name, last_name")
        .in("role", ["director_hr", "manager_hr", "hr_director"])
        .eq("is_active", true)
        .limit(1)
        .maybeSingle()
      if (defaultDir) {
        defaultDirectorName = `${defaultDir.first_name || ""} ${defaultDir.last_name || ""}`.trim()
      }
    }
    const attachDirectorName = (rows: any[]) =>
      rows.map((r: any) => ({
        ...r,
        director_hr_name: r.director_hr_id
          ? (directorNameMap.get(r.director_hr_id) || null)
          : (["approved_director", "awaiting_director_hr"].includes(r.status) ? defaultDirectorName || null : null),
        director_hr_position: r.director_hr_id
          ? (directorPositionMap.get(r.director_hr_id) || "Managing Director")
          : (["approved_director", "awaiting_director_hr"].includes(r.status) ? "Managing Director" : null),
      }))

    // Group timelines by loan_request_id
    const timelinesMap: Record<string, any[]> = {}
    for (const entry of (timelinesRes.data || [])) {
      if (!timelinesMap[entry.loan_request_id]) timelinesMap[entry.loan_request_id] = []
      timelinesMap[entry.loan_request_id].push(entry)
    }
    const myTimelines = myRequestIds.map((id: string) => ({
      loan_request_id: id,
      entries: timelinesMap[id] || [],
    }))

    // Build current HOD profile data (for dynamic resolution in loan requests)
    let currentHodProfile: any = null
    if (myHodLinkRes.data?.hod_user_id) {
      const { data: currentHodData } = await admin
        .from("user_profiles")
        .select("id, first_name, last_name, position, geofence_locations!assigned_location_id(name)")
        .eq("id", myHodLinkRes.data.hod_user_id)
        .maybeSingle()
      if (currentHodData) {
        currentHodProfile = {
          id: currentHodData.id,
          name: `${currentHodData.first_name || ""} ${currentHodData.last_name || ""}`.trim() || null,
          rank: currentHodData.position || null,
          location: (currentHodData as any)?.geofence_locations?.name || null,
        }
      }
    }

    return NextResponse.json({
      degraded: false,
      profile: {
        id: (profile as any).id,
        firstName: (profile as any).first_name,
        lastName: (profile as any).last_name,
        employeeId: (profile as any).employee_id,
        email: (profile as any).email || user.email,
        role: (profile as any).role,
        position: (profile as any).position,
        staffCategory,
        yearsOfService,
        dateOfAppointment,
        departmentId: (profile as any).department_id,
        assignedLocationId: (profile as any).assigned_location_id,
        departmentName: (profile as any)?.departments?.name || null,
        assignedLocationName: (profile as any)?.geofence_locations?.name || null,
        assignedLocationAddress: (profile as any)?.geofence_locations?.address || null,
        assignedDistrictName: (profile as any)?.geofence_locations?.districts?.name || null,
        linkedHodName,
        currentHodProfile,
      },
      role,
      permissions,
      loanTypes: resolvedTypesRes.data || [],
      myRequests: attachDirectorName(attachAccountsReviewerName(attachName(myRes.data || []))),
      myTimelines,
      directorApprovers,
      myTasks: attachDirectorName(attachAccountsReviewerName(attachName(myTasksRes.data || []))),
      inbox: {
        hod: attachAccountsReviewerName(attachName(hodRes.data || [])),
        loanOffice: attachAccountsReviewerName(attachName(loanOfficeRes.data || [])),
        accounts: attachAccountsReviewerName(attachName(accountsRes.data || [])),
        accountsSigned: attachAccountsReviewerName(attachName(accountsSignedRes.data || [])),
        committee: attachAccountsReviewerName(attachName(committeeRes.data || [])),
        hrOffice: attachDirectorName(attachAccountsReviewerName(attachHodInfo(attachName(hrRes.data || [])))),
        directorHr: attachDirectorName(attachAccountsReviewerName(attachHodInfo(attachName(directorRes.data || [])))),
        directorGoodFd: attachDirectorName(attachAccountsReviewerName(attachHodInfo(attachName(directorGoodFdRes.data || [])))),
        allLoans: attachDirectorName(attachAccountsReviewerName(attachName(allLoansRes.data || []))),
      },
    })
  } catch (error: any) {
    console.error("loan workflow get error", error)
    return NextResponse.json({ error: error?.message || "Failed to load loan workflow" }, { status: 500 })
  }
}
