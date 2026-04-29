import { NextResponse } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import {
  canDoAccounts,
  canDoCommittee,
  canDoDirectorHr,
  canDoHrOffice,
  canDoLoanOffice,
  isSchemaIssue,
  normalizeRole,
} from "@/lib/loan-workflow"

const HOD_AUTO_ADVANCE_DAYS = 3
const POST_LOAN_OFFICE_DELAY_DAYS = 5

async function notifyUsers(admin: any, userIds: string[], title: string, message: string, type = "loan_update", data: any = {}) {
  if (!userIds.length) return
  await admin.from("staff_notifications").insert(
    userIds.map((uid) => ({ user_id: uid, title, message, type, data, is_read: false })),
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
    .in("role", ["loan_officer", "hr_officer", "admin", "director_hr", "hr_director"])
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
    const supabase = await createClient()
    const admin = await createAdminClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

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

    const role = normalizeRole((profile as any).role)
    const deptName = (profile as any)?.departments?.name || null
    const deptCode = (profile as any)?.departments?.code || null

    const [typesRes, myRes, myHodLinkRes] = await Promise.all([
      admin
        .from("loan_types")
        .select("loan_key, loan_label, category, requires_committee, requires_fd_check, min_fd_score, min_qualification_note, fixed_amount, max_amount, sort_order")
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
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

    if (typesRes.error && isSchemaIssue(typesRes.error)) {
      const viewAllTabs =
        role === "admin" || role === "loan_officer" || role === "director_hr" || role === "hr_director"
      return NextResponse.json(
        {
          degraded: true,
          warning: "Loan module tables are not available yet. Run scripts/051_loan_module_workflow.sql in Supabase SQL Editor.",
          profile,
          role,
          loanTypes: [],
          myRequests: [],
          myTimelines: [],
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
            hod: ["department_head", "regional_manager", "admin"].includes(role),
            loanOffice: canDoLoanOffice(role, deptName, deptCode),
            accounts: canDoAccounts(role, deptName, deptCode),
            committee: canDoCommittee(role),
            hrOffice: canDoHrOffice(role, deptName, deptCode),
            directorHr: canDoDirectorHr(role, deptName, deptCode),
            viewAllTabs,
          },
        },
        { status: 200 },
      )
    }

    if (typesRes.error) throw typesRes.error
    if (myRes.error) throw myRes.error

    await autoAdvanceStaleHodRequests(admin)
    await broadcastDelayedPostLoanOfficeRequests(admin)

    // viewAllTabs: admin, loan_officer (HR Loan Office), director_hr see all tabs
    const viewAllTabs =
      role === "admin" || role === "loan_officer" || role === "director_hr" || role === "hr_director"

    const permissions = {
      hod: ["department_head", "regional_manager", "admin"].includes(role),
      loanOffice: canDoLoanOffice(role, deptName, deptCode),
      accounts: canDoAccounts(role, deptName, deptCode),
      committee: canDoCommittee(role),
      hrOffice: canDoHrOffice(role, deptName, deptCode),
      directorHr: canDoDirectorHr(role, deptName, deptCode),
      viewAllTabs,
    }

    // HOD query: linked HODs can review linked staff requests; first approval is enough to move forward.
    const hodPromise: Promise<any> = (async () => {
      if (!(permissions.hod || viewAllTabs)) return { data: [], error: null }
      if (viewAllTabs || !["department_head", "regional_manager"].includes(role)) {
        return admin
          .from("loan_requests")
          .select("*")
          .eq("status", "pending_hod")
          .order("created_at", { ascending: false })
      }

      const [directRes, linkageRes] = await Promise.all([
        admin
          .from("loan_requests")
          .select("*")
          .eq("status", "pending_hod")
          .eq("hod_reviewer_id", user.id)
          .order("created_at", { ascending: false }),
        admin.from("loan_hod_linkages").select("staff_user_id").eq("hod_user_id", user.id),
      ])

      if (directRes.error) return { data: null, error: directRes.error }
      if (linkageRes.error) return { data: null, error: linkageRes.error }

      const linkedStaffIds = Array.from(new Set((linkageRes.data || []).map((r: any) => r.staff_user_id).filter(Boolean)))
      let linkedData: any[] = []
      if (linkedStaffIds.length > 0) {
        const linkedRes = await admin
          .from("loan_requests")
          .select("*")
          .eq("status", "pending_hod")
          .in("user_id", linkedStaffIds)
          .order("created_at", { ascending: false })
        if (linkedRes.error) return { data: null, error: linkedRes.error }
        linkedData = linkedRes.data || []
      }

      const combined = [...(directRes.data || []), ...linkedData]
      const unique = Array.from(new Map(combined.map((r: any) => [r.id, r])).values())
      unique.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      return { data: unique, error: null }
    })()

    const showHod = permissions.hod || viewAllTabs
    const showLoanOffice = permissions.loanOffice || viewAllTabs
    const showAccounts = permissions.accounts || viewAllTabs
    const showCommittee = permissions.committee || viewAllTabs
    const showHrOffice = permissions.hrOffice || viewAllTabs
    const showDirectorHr = permissions.directorHr || viewAllTabs

    // HR loan office (loan_officer + viewAllTabs) sees all non-terminal loans
    const hrOfficeQ: any = !showHrOffice
      ? Promise.resolve({ data: [], error: null })
      : (viewAllTabs && role === "loan_officer")
        ? admin.from("loan_requests").select("*")
            .not("status", "in", '("hod_rejected","director_rejected","rejected_fd","committee_rejected")')
            .order("created_at", { ascending: false })
        : admin.from("loan_requests").select("*").eq("status", "awaiting_hr_terms").order("created_at", { ascending: false })

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
      viewAllTabs
        ? admin.from("loan_requests").select("*").order("created_at", { ascending: false })
        : Promise.resolve({ data: [], error: null } as any),
      myRequestIds.length > 0
        ? admin.from("loan_request_timeline").select("*").in("loan_request_id", myRequestIds).order("created_at", { ascending: true })
        : Promise.resolve({ data: [], error: null } as any),
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

    // Build a name lookup map for all staff who appear in any inbox list
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
    let staffNameMap: Map<string, string> = new Map()
    if (uniqueUserIds.length > 0) {
      const { data: staffProfiles } = await admin
        .from("user_profiles")
        .select("id, first_name, last_name")
        .in("id", uniqueUserIds)
      for (const sp of staffProfiles || []) {
        staffNameMap.set(sp.id, `${sp.first_name || ""} ${sp.last_name || ""}`.trim() || "—")
      }
    }
    const attachName = (rows: any[]) =>
      rows.map((r: any) => ({ ...r, staff_full_name: staffNameMap.get(r.user_id) || null }))

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
        departmentId: (profile as any).department_id,
        assignedLocationId: (profile as any).assigned_location_id,
        departmentName: (profile as any)?.departments?.name || null,
        assignedLocationName: (profile as any)?.geofence_locations?.name || null,
        assignedLocationAddress: (profile as any)?.geofence_locations?.address || null,
        assignedDistrictName: (profile as any)?.geofence_locations?.districts?.name || null,
        linkedHodName,
      },
      role,
      permissions,
      loanTypes: typesRes.data || [],
      myRequests: attachName(myRes.data || []),
      myTimelines,
      myTasks: attachName(myTasksRes.data || []),
      inbox: {
        hod: attachName(hodRes.data || []),
        loanOffice: attachName(loanOfficeRes.data || []),
        accounts: attachName(accountsRes.data || []),
        accountsSigned: attachName(accountsSignedRes.data || []),
        committee: attachName(committeeRes.data || []),
        hrOffice: attachHodInfo(attachName(hrRes.data || [])),
        directorHr: attachHodInfo(attachName(directorRes.data || [])),
        directorGoodFd: attachHodInfo(attachName(directorGoodFdRes.data || [])),
        allLoans: attachName(allLoansRes.data || []),
      },
    })
  } catch (error: any) {
    console.error("loan workflow get error", error)
    return NextResponse.json({ error: error?.message || "Failed to load loan workflow" }, { status: 500 })
  }
}
