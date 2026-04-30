import { NextRequest, NextResponse } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { canDoHrOffice, canDoLoanOffice, normalizeRole } from "@/lib/loan-workflow"

function canManageLookups(role: string, deptName?: string | null, deptCode?: string | null): boolean {
  return role === "admin" || canDoHrOffice(role, deptName, deptCode) || canDoLoanOffice(role, deptName, deptCode)
}

export async function GET() {
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

    const [loanTypesRes, locationsRes, staffRes, hodsRes, linkagesRes] = await Promise.all([
      admin
        .from("loan_types")
        .select("loan_key, loan_label, category, fixed_amount, max_amount, min_qualification_note, requires_committee, requires_fd_check, is_active, sort_order")
        .order("sort_order", { ascending: true }),
      admin.from("geofence_locations").select("id, name, address, districts(name)").eq("is_active", true).order("name", { ascending: true }),
      admin
        .from("user_profiles")
        .select("id, first_name, last_name, employee_id, position, role, department_id, departments(name, code), assigned_location_id, geofence_locations!assigned_location_id(name, address, districts(name))")
        .in("role", ["staff", "nsp", "intern", "contract", "it_admin", "department_head", "regional_manager", "loan_officer", "hr_officer", "accounts"])
        .eq("is_active", true)
        .order("first_name", { ascending: true }),
      admin
        .from("user_profiles")
        .select("id, first_name, last_name, employee_id, position, role, assigned_location_id")
        .in("role", ["department_head", "regional_manager"])
        .eq("is_active", true)
        .order("first_name", { ascending: true }),
      admin
        .from("loan_hod_linkages")
        .select("id, staff_user_id, hod_user_id, location_id, district_name, location_address, staff_rank, hod_rank, updated_at"),
    ])

    if (loanTypesRes.error) throw loanTypesRes.error
    if (locationsRes.error) throw locationsRes.error
    if (staffRes.error) throw staffRes.error
    if (hodsRes.error) throw hodsRes.error
    if (linkagesRes.error) throw linkagesRes.error

    return NextResponse.json({
      loanTypes: loanTypesRes.data || [],
      locations: locationsRes.data || [],
      staff: staffRes.data || [],
      hods: hodsRes.data || [],
      linkages: linkagesRes.data || [],
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
        .select("id, position, assigned_location_id, geofence_locations!assigned_location_id(address, districts(name))")
        .eq("id", staffUserId)
        .single()

      if (staffError || !staffProfile) {
        return NextResponse.json({ error: "Staff profile not found" }, { status: 404 })
      }

      const { data: hodProfile, error: hodError } = await admin
        .from("user_profiles")
        .select("id, position")
        .eq("id", hodUserId)
        .single()

      if (hodError || !hodProfile) {
        return NextResponse.json({ error: "HOD profile not found" }, { status: 404 })
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
        .select("id, position, assigned_location_id, geofence_locations!assigned_location_id(address, districts(name))")
        .eq("id", staffUserId)
        .single()

      if (staffError || !staffProfile) {
        return NextResponse.json({ error: "Staff profile not found" }, { status: 404 })
      }

      const { data: hodRows, error: hodRowsError } = await admin
        .from("user_profiles")
        .select("id, position")
        .in("id", hodUserIds)

      if (hodRowsError) throw hodRowsError

      const positionByHod = new Map((hodRows || []).map((r: any) => [r.id, r.position || null]))

      const rows = hodUserIds.map((hodId) => ({
        staff_user_id: staffUserId,
        hod_user_id: hodId,
        location_id: (staffProfile as any).assigned_location_id || null,
        district_name: (staffProfile as any)?.geofence_locations?.districts?.name || null,
        location_address: (staffProfile as any)?.geofence_locations?.address || null,
        staff_rank: (staffProfile as any)?.position || null,
        hod_rank: positionByHod.get(hodId) || null,
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
          .select("id, position, assigned_location_id, geofence_locations!assigned_location_id(address, districts(name))")
          .in("id", staffUserIds),
        admin.from("user_profiles").select("id, position").eq("id", hodUserId).single(),
      ])

      if (staffRowsError) throw staffRowsError
      if (hodError || !hodProfile) {
        return NextResponse.json({ error: "HOD profile not found" }, { status: 404 })
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
        .select("id, position, assigned_location_id, geofence_locations!assigned_location_id(address, districts(name))")
        .in("role", ["staff", "nsp", "intern", "contract", "it_admin"])
        .eq("is_active", true)

      if (staffError) throw staffError

      let updated = 0
      for (const staff of staffRows || []) {
        const locationId = (staff as any).assigned_location_id
        if (!locationId) continue

        const { data: hodRows } = await admin
          .from("user_profiles")
          .select("id, position")
          .eq("assigned_location_id", locationId)
          .in("role", ["regional_manager", "department_head"])
          .eq("is_active", true)
          .limit(20)

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

    return NextResponse.json({ error: "Unsupported action" }, { status: 400 })
  } catch (error: any) {
    console.error("loan lookups post error", error)
    return NextResponse.json({ error: error?.message || "Failed to update loan lookups" }, { status: 500 })
  }
}
