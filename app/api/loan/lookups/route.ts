import { NextRequest, NextResponse } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { canDoHrOffice, canDoLoanOffice, normalizeRole } from "@/lib/loan-workflow"

function canManageLookups(role: string, deptName?: string | null, deptCode?: string | null): boolean {
  return (
    role === "admin" ||
    role === "it-admin" ||
    role === "loan_office" ||
    role === "manager_hr" ||
    role === "director_hr" ||
    role === "accounts" ||
    role === "regional_manager" ||
    role === "department_head" ||
    canDoHrOffice(role, deptName, deptCode) ||
    canDoLoanOffice(role, deptName, deptCode)
  )
}

function isHeadOfficeStaff(staff: any): boolean {
  const locationName = String(staff?.geofence_locations?.name || "").toLowerCase()
  if (!staff?.assigned_location_id) return true
  return locationName.includes("head office")
}

function validateStaffHodRule(staff: any, hod: any): { ok: boolean; reason?: string } {
  const staffLoc = String(staff?.assigned_location_id || "")
  const hodLoc = String(hod?.assigned_location_id || "")
  const hodRole = normalizeRole(String(hod?.role || ""))

  // Admin/it-admin linkages are fully trusted — only validate HOD role type
  if (isHeadOfficeStaff(staff)) {
    if (hodRole !== "department_head" && hodRole !== "admin" && hodRole !== "it_admin") {
      return { ok: false, reason: "Head-office staff can only be linked to Department Heads." }
    }
    // Department matching is NOT enforced — admin decides the correct HOD assignment
    return { ok: true }
  }

  // Regional staff must link to a regional_manager; enforce same location
  if (hodRole !== "regional_manager" && hodRole !== "admin" && hodRole !== "it_admin") {
    return { ok: false, reason: "Regional staff can only be linked to Regional Managers." }
  }
  if (hodRole === "regional_manager" && staffLoc && hodLoc && staffLoc !== hodLoc) {
    return { ok: false, reason: "Regional staff can only be linked to Regional Managers in the same location." }
  }
  return { ok: true }
}

async function fetchAllRows(queryFactory: (from: number, to: number) => any, chunkSize = 500) {
  const rows: any[] = []
  let from = 0

  while (true) {
    const to = from + chunkSize - 1
    const { data, error } = await queryFactory(from, to)
    if (error) throw error

    const batch = data || []
    rows.push(...batch)

    if (batch.length < chunkSize) break
    from += chunkSize
  }

  return rows
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const admin = await createAdminClient()
    const url = new URL(request.url)
    const search = String(url.searchParams.get("search") || "").trim().toLowerCase()
    const limitParam = Number(url.searchParams.get("limit") || 5000)
    const requestedLimit = Number.isFinite(limitParam) ? Math.max(100, Math.min(limitParam, 20000)) : 5000

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: profile } = await admin
      .from("user_profiles")
      .select("id, role, department_id, assigned_location_id, departments(name, code)")
      .eq("id", user.id)
      .maybeSingle()

    const role = normalizeRole((profile as any)?.role)
    const deptName = (profile as any)?.departments?.name || null
    const deptCode = (profile as any)?.departments?.code || null
    const departmentId = String((profile as any)?.department_id || "")
    const assignedLocationId = String((profile as any)?.assigned_location_id || "")

    if (!canManageLookups(role, deptName, deptCode)) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
    }

    const [loanTypesRes, locationsRes, allStaff, allHods, allLinkages] = await Promise.all([
      admin
        .from("loan_types")
        .select("loan_key, loan_label, category, fixed_amount, max_amount, min_qualification_note, requires_committee, requires_fd_check, is_active, sort_order")
        .order("sort_order", { ascending: true }),
      admin.from("geofence_locations").select("id, name, address, districts(name)").order("name", { ascending: true }),
      fetchAllRows(
        (from, to) =>
          admin
            .from("user_profiles")
            .select("id, first_name, last_name, employee_id, position, role, department_id, departments(name, code), assigned_location_id, geofence_locations!assigned_location_id(name, address, districts(name))")
            .in("role", ["staff", "nsp", "intern", "contract", "it-admin", "it_admin", "department_head", "regional_manager", "loan_officer", "loan_office", "hr_officer", "hr_office", "accounts", "director_hr", "manager_hr", "audit_staff", "loan_committee", "committee"])
            .eq("is_active", true)
            .order("first_name", { ascending: true })
            .range(from, to),
      ),
      fetchAllRows(
        (from, to) =>
          admin
            .from("user_profiles")
            .select("id, first_name, last_name, employee_id, position, role, department_id, assigned_location_id, geofence_locations!assigned_location_id(name)")
            .in("role", ["department_head", "regional_manager"])
            .eq("is_active", true)
            .order("first_name", { ascending: true })
            .range(from, to),
      ),
      fetchAllRows(
        (from, to) =>
          admin
            .from("loan_hod_linkages")
            .select("id, staff_user_id, hod_user_id, location_id, district_name, location_address, staff_rank, hod_rank, updated_at")
            .order("updated_at", { ascending: false })
            .range(from, to),
      ),
    ])

    if (loanTypesRes.error) throw loanTypesRes.error
    if (locationsRes.error) throw locationsRes.error

    let staffRows = allStaff || []
    let hodRows = allHods || []
    let linkageRows = allLinkages || []
    let linkageRequestRows: any[] = []

    if (role === "regional_manager") {
      if (assignedLocationId) {
        staffRows = staffRows.filter((row: any) => String(row.assigned_location_id || "") === assignedLocationId)
        hodRows = hodRows.filter((row: any) => String(row.assigned_location_id || "") === assignedLocationId || row.id === user.id)
      } else {
        staffRows = []
      }
    }

    if (role === "department_head") {
      staffRows = staffRows.filter((row: any) => {
        const sameDepartment = departmentId && String(row.department_id || "") === departmentId
        const sameLocation = !assignedLocationId || String(row.assigned_location_id || "") === assignedLocationId
        return Boolean(sameDepartment && sameLocation)
      })
      hodRows = hodRows.filter((row: any) => String(row.id || "") === user.id || (assignedLocationId ? String(row.assigned_location_id || "") === assignedLocationId : true))
    }

    const staffById = new Map((staffRows || []).map((row: any) => [String(row.id), row]))
    const hodById = new Map((hodRows || []).map((row: any) => [String(row.id), row]))

    const staffIds = new Set(staffRows.map((row: any) => String(row.id)))
    linkageRows = linkageRows.filter((row: any) => {
      const staff = staffById.get(String(row.staff_user_id || ""))
      const hod = hodById.get(String(row.hod_user_id || ""))
      if (!staff || !hod) return false
      return validateStaffHodRule(staff, hod).ok
    })

    if (search) {
      const matchesSearch = (text: string) => text.toLowerCase().includes(search)
      staffRows = staffRows.filter((row: any) =>
        matchesSearch(
          `${row.first_name || ""} ${row.last_name || ""} ${row.employee_id || ""} ${row.position || ""} ${(row as any)?.departments?.name || ""}`,
        ),
      )
      const filteredStaffIds = new Set(staffRows.map((row: any) => String(row.id)))
      linkageRows = linkageRows.filter((row: any) => filteredStaffIds.has(String(row.staff_user_id || "")))
    }

    staffRows = staffRows.slice(0, requestedLimit)
    const finalStaffIds = new Set(staffRows.map((row: any) => String(row.id)))
    linkageRows = linkageRows.filter((row: any) => finalStaffIds.has(String(row.staff_user_id || "")))

    if (role === "admin") {
      try {
        const linkageNotifications = await fetchAllRows(
          (from, to) =>
            admin
              .from("staff_notifications")
              .select("id, recipient_id, title, message, type, data, is_read, read_at, created_at")
              .eq("type", "hod_linkage_request")
              .order("created_at", { ascending: false })
              .range(from, to),
          250,
        )

        const requestNotifications = (linkageNotifications || []).filter((row: any) => String(row.recipient_id || "") === String(user.id))
        const referencedIds = Array.from(
          new Set(
            requestNotifications
              .flatMap((row: any) => [
                String((row as any)?.data?.requested_by || ""),
                String((row as any)?.data?.staff_user_id || ""),
                String((row as any)?.data?.requested_hod_user_id || ""),
                String((row as any)?.data?.resolved_by || ""),
              ])
              .filter(Boolean),
          ),
        )

        const { data: referencedProfiles } = referencedIds.length
          ? await admin
              .from("user_profiles")
              .select("id, first_name, last_name, employee_id, position, role")
              .in("id", referencedIds)
          : ({ data: [] } as any)

        const profileMap = new Map(
          (referencedProfiles || []).map((row: any) => [
            String(row.id),
            {
              id: row.id,
              full_name: `${row.first_name || ""} ${row.last_name || ""}`.trim() || row.role || "Unknown",
              employee_id: row.employee_id || null,
              position: row.position || null,
              role: row.role || null,
            },
          ]),
        )

        linkageRequestRows = requestNotifications.map((row: any) => {
          const payload = (row.data && typeof row.data === "object") ? row.data : {}
          const requesterId = String(payload.requested_by || "")
          const staffId = String(payload.staff_user_id || "")
          const requestedHodId = String(payload.requested_hod_user_id || "")
          const resolvedById = String(payload.resolved_by || "")

          return {
            id: row.id,
            title: row.title,
            message: row.message,
            created_at: row.created_at,
            is_read: row.is_read,
            read_at: row.read_at || null,
            request_status: payload.request_status || "pending",
            request_note: payload.note || null,
            resolution_note: payload.resolution_note || null,
            resolved_at: payload.resolved_at || null,
            requester: profileMap.get(requesterId) || null,
            staff: profileMap.get(staffId) || null,
            requested_hod: profileMap.get(requestedHodId) || null,
            resolved_by: profileMap.get(resolvedById) || null,
          }
        })
      } catch (linkageError: any) {
        const msg = String(linkageError?.message || "").toLowerCase()
        const legacyNotificationsSchema =
          msg.includes("staff_notifications") &&
          (msg.includes("column") || msg.includes("schema cache") || msg.includes("does not exist"))

        if (!legacyNotificationsSchema) {
          throw linkageError
        }

        // Legacy DB schema: linkage request notifications are unavailable, but do not block admin lookup data.
        linkageRequestRows = []
      }
    }

    return NextResponse.json({
      loanTypes: loanTypesRes.data || [],
      locations: locationsRes.data || [],
      staff: staffRows,
      hods: hodRows,
      linkages: linkageRows,
      linkageRequests: linkageRequestRows,
    })
  } catch (error: any) {
    console.error("loan lookups get error", error)
    return NextResponse.json({ error: error?.message || "Failed to load loan lookups" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const admin = await createAdminClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: profile } = await admin
      .from("user_profiles")
      .select("id, role, departments(name, code)")
      .eq("id", user.id)
      .maybeSingle()

    const role = normalizeRole((profile as any)?.role)
    const deptName = (profile as any)?.departments?.name || null
    const deptCode = (profile as any)?.departments?.code || null

    if (!canManageLookups(role, deptName, deptCode)) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
    }

    const body = await request.json()
    const action = String(body?.action || "")

    if (action === "update_loan_type") {
      const loanKey = String(body?.loan_key || "")
      const fixedAmount = Number(body?.fixed_amount)
      const maxAmount = Number(body?.max_amount)
      const minQualification = String(body?.min_qualification_note || "").trim() || null
      const requiresCommittee = Boolean(body?.requires_committee)
      const requiresFdCheck = body?.requires_fd_check !== false

      if (!loanKey || !Number.isFinite(fixedAmount) || !Number.isFinite(maxAmount)) {
        return NextResponse.json({ error: "loan_key, fixed_amount and max_amount are required" }, { status: 400 })
      }

      const { data, error } = await admin
        .from("loan_types")
        .update({
          fixed_amount: fixedAmount,
          max_amount: maxAmount,
          min_qualification_note: minQualification,
          requires_committee: requiresCommittee,
          requires_fd_check: requiresFdCheck,
          updated_at: new Date().toISOString(),
        })
        .eq("loan_key", loanKey)
        .select("*")
        .single()

      if (error) throw error
      return NextResponse.json({ success: true, data })
    }

    if (action === "upsert_hod_linkage") {
      const staffUserId = String(body?.staff_user_id || "")
      const hodUserId = String(body?.hod_user_id || "")

      if (!staffUserId || !hodUserId) {
        return NextResponse.json({ error: "staff_user_id and hod_user_id are required" }, { status: 400 })
      }

      const { data: staffProfile, error: staffError } = await admin
        .from("user_profiles")
        .select("id, role, department_id, position, assigned_location_id, geofence_locations!assigned_location_id(name, address, districts(name))")
        .eq("id", staffUserId)
        .single()

      if (staffError || !staffProfile) {
        return NextResponse.json({ error: "Staff profile not found" }, { status: 404 })
      }

      const { data: hodProfile, error: hodError } = await admin
        .from("user_profiles")
        .select("id, role, department_id, assigned_location_id, position")
        .eq("id", hodUserId)
        .single()

      if (hodError || !hodProfile) {
        return NextResponse.json({ error: "HOD profile not found" }, { status: 404 })
      }

      const ruleCheck = validateStaffHodRule(staffProfile, hodProfile)
      if (!ruleCheck.ok) {
        return NextResponse.json({ error: ruleCheck.reason || "Invalid staff-to-HOD linkage." }, { status: 400 })
      }

      const payload = {
        staff_user_id: staffUserId,
        hod_user_id: hodUserId,
        location_id: (staffProfile as any).assigned_location_id || null,
        district_name: (staffProfile as any)?.geofence_locations?.districts?.name || null,
        location_address: (staffProfile as any)?.geofence_locations?.address || null,
        staff_rank: (staffProfile as any)?.position || null,
        hod_rank: (hodProfile as any)?.position || null,
        created_by: user.id,
        updated_at: new Date().toISOString(),
      }

      const { data, error } = await admin
        .from("loan_hod_linkages")
        .upsert(payload, { onConflict: "staff_user_id,hod_user_id" })
        .select("*")
        .single()

      if (error) throw error
      return NextResponse.json({ success: true, data })
    }

    if (action === "upsert_hod_linkage_batch") {
      const staffUserId = String(body?.staff_user_id || "")
      const hodUserIds = Array.isArray(body?.hod_user_ids)
        ? Array.from(new Set((body.hod_user_ids as any[]).map((v) => String(v || "")).filter(Boolean)))
        : []

      if (!staffUserId || hodUserIds.length === 0) {
        return NextResponse.json({ error: "staff_user_id and hod_user_ids[] are required" }, { status: 400 })
      }

      const { data: staffProfile, error: staffError } = await admin
        .from("user_profiles")
        .select("id, role, department_id, position, assigned_location_id, geofence_locations!assigned_location_id(name, address, districts(name))")
        .eq("id", staffUserId)
        .single()

      if (staffError || !staffProfile) {
        return NextResponse.json({ error: "Staff profile not found" }, { status: 404 })
      }

      const { data: hodRows, error: hodRowsError } = await admin
        .from("user_profiles")
        .select("id, role, department_id, assigned_location_id, position")
        .in("id", hodUserIds)

      if (hodRowsError) throw hodRowsError

      const byHod = new Map((hodRows || []).map((r: any) => [String(r.id), r]))

      const invalidPairs: string[] = []
      for (const hodId of hodUserIds) {
        const hod = byHod.get(String(hodId))
        if (!hod) {
          invalidPairs.push(`${hodId}: HOD profile not found`)
          continue
        }
        const rule = validateStaffHodRule(staffProfile, hod)
        if (!rule.ok) invalidPairs.push(`${hodId}: ${rule.reason}`)
      }

      if (invalidPairs.length > 0) {
        return NextResponse.json({
          error: "One or more selected HOD assignments are invalid for this staff.",
          details: invalidPairs,
        }, { status: 400 })
      }

      const rows = hodUserIds.map((hodId) => ({
        staff_user_id: staffUserId,
        hod_user_id: hodId,
        location_id: (staffProfile as any).assigned_location_id || null,
        district_name: (staffProfile as any)?.geofence_locations?.districts?.name || null,
        location_address: (staffProfile as any)?.geofence_locations?.address || null,
        staff_rank: (staffProfile as any)?.position || null,
        hod_rank: byHod.get(String(hodId))?.position || null,
        created_by: user.id,
        updated_at: new Date().toISOString(),
      }))

      const { data, error } = await admin
        .from("loan_hod_linkages")
        .upsert(rows, { onConflict: "staff_user_id,hod_user_id" })
        .select("*")

      if (error) throw error
      return NextResponse.json({ success: true, data })
    }

    if (action === "upsert_hod_linkage_staff_batch") {
      const staffUserIds = Array.isArray(body?.staff_user_ids)
        ? Array.from(new Set((body.staff_user_ids as any[]).map((v) => String(v || "")).filter(Boolean)))
        : []
      const hodUserId = String(body?.hod_user_id || "")

      if (staffUserIds.length === 0 || !hodUserId) {
        return NextResponse.json({ error: "staff_user_ids[] and hod_user_id are required" }, { status: 400 })
      }

      const [{ data: staffRows, error: staffRowsError }, { data: hodProfile, error: hodError }] = await Promise.all([
        admin
          .from("user_profiles")
          .select("id, role, department_id, position, assigned_location_id, geofence_locations!assigned_location_id(name, address, districts(name))")
          .in("id", staffUserIds),
        admin.from("user_profiles").select("id, role, department_id, assigned_location_id, position").eq("id", hodUserId).single(),
      ])

      if (staffRowsError) throw staffRowsError
      if (hodError || !hodProfile) {
        return NextResponse.json({ error: "HOD profile not found" }, { status: 404 })
      }

      const invalidStaff: string[] = []
      for (const staff of staffRows || []) {
        const rule = validateStaffHodRule(staff, hodProfile)
        if (!rule.ok) {
          const staffLabel = `${staff?.id || "unknown"}`
          invalidStaff.push(`${staffLabel}: ${rule.reason}`)
        }
      }

      if (invalidStaff.length > 0) {
        return NextResponse.json({
          error: "One or more staff cannot be linked to this HOD by current policy.",
          details: invalidStaff,
        }, { status: 400 })
      }

      const rows = (staffRows || []).map((staff: any) => ({
        staff_user_id: staff.id,
        hod_user_id: hodUserId,
        location_id: staff.assigned_location_id || null,
        district_name: staff?.geofence_locations?.districts?.name || null,
        location_address: staff?.geofence_locations?.address || null,
        staff_rank: staff?.position || null,
        hod_rank: (hodProfile as any)?.position || null,
        created_by: user.id,
        updated_at: new Date().toISOString(),
      }))

      const { data, error } = await admin
        .from("loan_hod_linkages")
        .upsert(rows, { onConflict: "staff_user_id,hod_user_id" })
        .select("*")

      if (error) throw error
      return NextResponse.json({ success: true, data, updated: rows.length })
    }

    if (action === "update_staff_rank") {
      const staffUserId = String(body?.staff_user_id || "")
      const rankLevel = String(body?.rank_level || "").toLowerCase()

      if (!staffUserId || !["junior", "senior", "manager"].includes(rankLevel)) {
        return NextResponse.json({ error: "staff_user_id and rank_level (junior|senior|manager) are required" }, { status: 400 })
      }

      const rankTitleMap: Record<string, string> = {
        junior: "Junior",
        senior: "Senior",
        manager: "Manager",
      }

      const { data, error } = await admin
        .from("user_profiles")
        .update({ position: rankTitleMap[rankLevel], updated_at: new Date().toISOString() })
        .eq("id", staffUserId)
        .select("id, first_name, last_name, employee_id, position")
        .single()

      if (error) throw error
      return NextResponse.json({ success: true, data })
    }

    if (action === "auto_link_by_location") {
      const { data: staffRows, error: staffError } = await admin
        .from("user_profiles")
        .select("id, role, department_id, position, assigned_location_id, geofence_locations!assigned_location_id(name, address, districts(name))")
        .in("role", ["staff", "nsp", "intern", "contract", "it-admin", "it_admin", "audit_staff"])
        .eq("is_active", true)

      if (staffError) throw staffError

      let updated = 0
      for (const staff of staffRows || []) {
        const locationId = (staff as any).assigned_location_id
        let hodQuery = admin
          .from("user_profiles")
          .select("id, role, department_id, assigned_location_id, position")
          .eq("is_active", true)
          .limit(20)

        if (isHeadOfficeStaff(staff)) {
          const deptId = String((staff as any)?.department_id || "")
          if (!deptId) continue
          hodQuery = hodQuery.eq("department_id", deptId).eq("role", "department_head")
        } else {
          if (!locationId) continue
          hodQuery = hodQuery.eq("assigned_location_id", locationId).eq("role", "regional_manager")
        }

        const { data: hodRows } = await hodQuery

        if (!hodRows || hodRows.length === 0) continue

        const payload = (hodRows as any[]).map((hod: any) => ({
          staff_user_id: (staff as any).id,
          hod_user_id: hod.id,
          location_id: locationId,
          district_name: (staff as any)?.geofence_locations?.districts?.name || null,
          location_address: (staff as any)?.geofence_locations?.address || null,
          staff_rank: (staff as any)?.position || null,
          hod_rank: hod.position || null,
          created_by: user.id,
          updated_at: new Date().toISOString(),
        }))

        const { error: upsertErr } = await admin.from("loan_hod_linkages").upsert(payload, { onConflict: "staff_user_id,hod_user_id" })
        if (!upsertErr) updated += payload.length
      }

      return NextResponse.json({ success: true, updated })
    }

    if (action === "auto_link_it_admin_staff") {
      const [{ data: staffRows, error: staffError }, { data: adminRows, error: adminError }] = await Promise.all([
        admin
          .from("user_profiles")
          .select("id, position, assigned_location_id, geofence_locations!assigned_location_id(address, districts(name))")
          .eq("role", "it_admin")
          .eq("is_active", true),
        admin
          .from("user_profiles")
          .select("id, position")
          .eq("role", "admin")
          .eq("is_active", true),
      ])

      if (staffError) throw staffError
      if (adminError) throw adminError

      let updated = 0
      for (const staff of staffRows || []) {
        const payload = (adminRows || []).map((adminProfile: any) => ({
          staff_user_id: (staff as any).id,
          hod_user_id: adminProfile.id,
          location_id: (staff as any).assigned_location_id || null,
          district_name: (staff as any)?.geofence_locations?.districts?.name || null,
          location_address: (staff as any)?.geofence_locations?.address || null,
          staff_rank: (staff as any)?.position || null,
          hod_rank: adminProfile.position || "Admin",
          created_by: user.id,
          updated_at: new Date().toISOString(),
        }))

        if (payload.length === 0) continue

        const { error } = await admin.from("loan_hod_linkages").upsert(payload, { onConflict: "staff_user_id,hod_user_id" })
        if (!error) updated += payload.length
      }

      return NextResponse.json({ success: true, updated })
    }

    if (action === "request_hod_linkage") {
      const staffUserId = String(body?.staff_user_id || "")
      const requestedHodUserId = String(body?.requested_hod_user_id || "")
      const requestNote = String(body?.note || "").trim()

      if (!staffUserId || !requestedHodUserId) {
        return NextResponse.json({ error: "staff_user_id and requested_hod_user_id are required" }, { status: 400 })
      }

      const [{ data: staffProfile }, { data: hodProfile }, { data: requesterProfile }, { data: adminProfiles }] = await Promise.all([
        admin.from("user_profiles").select("id, first_name, last_name, employee_id, department_id, assigned_location_id, geofence_locations!assigned_location_id(name)").eq("id", staffUserId).maybeSingle(),
        admin.from("user_profiles").select("id, first_name, last_name, role, department_id, assigned_location_id").eq("id", requestedHodUserId).maybeSingle(),
        admin.from("user_profiles").select("id, first_name, last_name, role").eq("id", user.id).maybeSingle(),
        admin.from("user_profiles").select("id").eq("role", "admin").eq("is_active", true),
      ])

      if (!staffProfile || !hodProfile) {
        return NextResponse.json({ error: "Staff or HOD profile not found" }, { status: 404 })
      }

      const ruleCheck = validateStaffHodRule(staffProfile, hodProfile)
      if (!ruleCheck.ok) {
        return NextResponse.json({ error: ruleCheck.reason || "Invalid staff-to-HOD linkage request." }, { status: 400 })
      }

      const adminIds = (adminProfiles || []).map((row: any) => row.id)
      if (adminIds.length === 0) {
        return NextResponse.json({ error: "No admin account available to review this linkage request" }, { status: 400 })
      }

      const requesterName = `${(requesterProfile as any)?.first_name || ""} ${(requesterProfile as any)?.last_name || ""}`.trim() || "Staff"
      const staffName = `${(staffProfile as any)?.first_name || ""} ${(staffProfile as any)?.last_name || ""}`.trim()
      const hodName = `${(hodProfile as any)?.first_name || ""} ${(hodProfile as any)?.last_name || ""}`.trim()

      const notifications = adminIds.map((adminId) => ({
        recipient_id: adminId,
        title: "HOD Linkage Request",
        message: `${requesterName} requested linkage: ${staffName} (${(staffProfile as any)?.employee_id || "N/A"}) -> ${hodName} (${(hodProfile as any)?.role || "HOD"}).`,
        type: "hod_linkage_request",
        data: {
          requested_by: user.id,
          staff_user_id: staffUserId,
          requested_hod_user_id: requestedHodUserId,
          note: requestNote || null,
        },
        is_read: false,
      }))

      const { error: notifError } = await admin.from("staff_notifications").insert(notifications)
      if (notifError) throw notifError

      return NextResponse.json({ success: true, requested: true })
    }

    if (action === "resolve_hod_linkage_request") {
      if (role !== "admin") {
        return NextResponse.json({ error: "Only admin can resolve linkage requests" }, { status: 403 })
      }

      const requestId = String(body?.request_id || "")
      const decision = body?.decision === "reject" ? "reject" : "approve"
      const resolutionNote = String(body?.note || "").trim() || null

      if (!requestId) {
        return NextResponse.json({ error: "request_id is required" }, { status: 400 })
      }

      const { data: notificationRow, error: notificationError } = await admin
        .from("staff_notifications")
        .select("id, recipient_id, title, message, type, data, is_read")
        .eq("id", requestId)
        .eq("type", "hod_linkage_request")
        .maybeSingle()

      if (notificationError) throw notificationError
      if (!notificationRow) {
        return NextResponse.json({ error: "Linkage request not found" }, { status: 404 })
      }

      const payload = ((notificationRow as any).data && typeof (notificationRow as any).data === "object") ? (notificationRow as any).data : {}
      if (payload.request_status && payload.request_status !== "pending") {
        return NextResponse.json({ error: "This linkage request has already been resolved" }, { status: 409 })
      }

      const staffUserId = String(payload.staff_user_id || "")
      const requestedHodUserId = String(payload.requested_hod_user_id || "")
      const requestedById = String(payload.requested_by || "")

      if (!staffUserId || !requestedHodUserId) {
        return NextResponse.json({ error: "Stored linkage request is incomplete" }, { status: 400 })
      }

      const [{ data: staffProfile }, { data: hodProfile }] = await Promise.all([
        admin.from("user_profiles").select("id, first_name, last_name, employee_id, department_id, position, assigned_location_id, geofence_locations!assigned_location_id(name, address, districts(name))").eq("id", staffUserId).maybeSingle(),
        admin.from("user_profiles").select("id, first_name, last_name, role, department_id, assigned_location_id, position").eq("id", requestedHodUserId).maybeSingle(),
      ])

      if (!staffProfile || !hodProfile) {
        return NextResponse.json({ error: "Staff or requested HOD profile no longer exists" }, { status: 404 })
      }

      const ruleCheck = validateStaffHodRule(staffProfile, hodProfile)
      if (!ruleCheck.ok) {
        return NextResponse.json({ error: ruleCheck.reason || "Invalid staff-to-HOD linkage approval." }, { status: 400 })
      }

      if (decision === "approve") {
        const linkagePayload = {
          staff_user_id: staffUserId,
          hod_user_id: requestedHodUserId,
          location_id: (staffProfile as any).assigned_location_id || null,
          district_name: (staffProfile as any)?.geofence_locations?.districts?.name || null,
          location_address: (staffProfile as any)?.geofence_locations?.address || null,
          staff_rank: (staffProfile as any)?.position || null,
          hod_rank: (hodProfile as any)?.position || (hodProfile as any)?.role || null,
          created_by: requestedById || user.id,
          updated_at: new Date().toISOString(),
        }

        const { error: upsertError } = await admin
          .from("loan_hod_linkages")
          .upsert(linkagePayload, { onConflict: "staff_user_id,hod_user_id" })

        if (upsertError) throw upsertError
      }

      const updatedData = {
        ...payload,
        request_status: decision === "approve" ? "approved" : "rejected",
        resolution_note: resolutionNote,
        resolved_by: user.id,
        resolved_at: new Date().toISOString(),
      }

      const { error: updateError } = await admin
        .from("staff_notifications")
        .update({
          is_read: true,
          read_at: new Date().toISOString(),
          data: updatedData,
        })
        .eq("id", requestId)

      if (updateError) throw updateError

      const staffName = `${(staffProfile as any)?.first_name || ""} ${(staffProfile as any)?.last_name || ""}`.trim() || "Staff"
      const hodName = `${(hodProfile as any)?.first_name || ""} ${(hodProfile as any)?.last_name || ""}`.trim() || "HOD"
      const decisionLabel = decision === "approve" ? "approved" : "rejected"

      const notifyIds = Array.from(new Set([requestedById, staffUserId].filter(Boolean)))
      await admin.from("staff_notifications").insert(
        notifyIds.map((recipientId) => ({
          recipient_id: recipientId,
          title: `HOD Linkage Request ${decision === "approve" ? "Approved" : "Rejected"}`,
          message: `Admin ${decisionLabel} the linkage request for ${staffName} -> ${hodName}.${resolutionNote ? ` Note: ${resolutionNote}` : ""}`,
          type: decision === "approve" ? "hod_linkage_request_approved" : "hod_linkage_request_rejected",
          data: {
            request_id: requestId,
            staff_user_id: staffUserId,
            requested_hod_user_id: requestedHodUserId,
            resolution_note: resolutionNote,
          },
          is_read: false,
        })),
      )

      return NextResponse.json({ success: true, resolved: true, decision: updatedData.request_status })
    }

    return NextResponse.json({ error: "Unsupported action" }, { status: 400 })
  } catch (error: any) {
    console.error("loan lookups post error", error)
    return NextResponse.json({ error: error?.message || "Failed to update loan lookups" }, { status: 500 })
  }
}
