import { createClient as createServerClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/server"
import * as XLSX from "xlsx"
import { NextRequest, NextResponse } from "next/server"

const HR_ROLES = new Set([
  "hr_officer",
  "manager_hr",
  "director_hr",
  "hr_director",
  "hr_leave_office",
  "hr_office",
  "hr",
  "admin",
])
const SCOPED_ROLES = new Set(["department_head", "regional_manager"])

function normalizeRole(value: unknown) {
  return String(value || "").toLowerCase().trim().replace(/[-\s]+/g, "_")
}

function csvDate(value: unknown) {
  return value ? new Date(String(value)).toLocaleDateString("en-GB") : ""
}

export async function GET(request: NextRequest) {
  try {
    const authClient = await createServerClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 })

    const admin = await createAdminClient()
    const { data: actor, error: actorError } = await admin
      .from("user_profiles")
      .select("id, role, department_id, assigned_location_id")
      .eq("id", user.id)
      .single()

    if (actorError || !actor) return NextResponse.json({ error: "Staff profile not found" }, { status: 403 })

    const role = normalizeRole(actor.role)
    if (!HR_ROLES.has(role) && !SCOPED_ROLES.has(role)) {
      return NextResponse.json({ error: "Only HOD, RM, and HR Leave Center users can export annual leave" }, { status: 403 })
    }

    const searchParams = request.nextUrl.searchParams
    const requestedLocation = searchParams.get("location_id") || ""
    const requestedDepartment = searchParams.get("department_id") || ""
    const status = searchParams.get("status") || ""
    const leaveYear = searchParams.get("leave_year") || ""

    if (SCOPED_ROLES.has(role)) {
      if (role === "department_head" && String(actor.department_id || "") === "") {
        return NextResponse.json({ error: "Your profile has no assigned department for export scoping" }, { status: 403 })
      }
      if (role === "regional_manager" && String(actor.assigned_location_id || "") === "") {
        return NextResponse.json({ error: "Your profile has no assigned location for export scoping" }, { status: 403 })
      }
      if (role === "department_head" && requestedDepartment && requestedDepartment !== String(actor.department_id || "")) {
        return NextResponse.json({ error: "HOD exports are limited to the assigned department" }, { status: 403 })
      }
      if (role === "regional_manager" && requestedLocation && requestedLocation !== String(actor.assigned_location_id || "")) {
        return NextResponse.json({ error: "RM exports are limited to the assigned location" }, { status: 403 })
      }
    }

    let query = admin
      .from("leave_plan_requests")
      .select("id, user_id, leave_type_key, preferred_start_date, preferred_end_date, adjusted_start_date, adjusted_end_date, requested_days, adjusted_days, entitlement_days, leave_entitlement_days, travelling_days_added, status, reason, created_at, submitted_at, hod_reviewed_at, hr_approved_at")
      .eq("leave_type_key", "annual")
      .order("submitted_at", { ascending: false })

    if (status) query = query.eq("status", status)
    if (role === "department_head") query = query.eq("department_id", actor.department_id)
    if (role === "regional_manager") query = query.eq("assigned_location_id", actor.assigned_location_id)
    if (leaveYear) {
      query = query.gte("preferred_start_date", `${leaveYear}-01-01`).lt("preferred_start_date", `${Number(leaveYear) + 1}-01-01`)
    }

    const { data: requests, error: requestError } = await query
    if (requestError) {
      console.error("[v0] Annual export request query failed:", requestError)
      return NextResponse.json({ error: "Annual leave records could not be loaded. Check the leave request schema and assigned scope." }, { status: 500 })
    }

    const userIds = [...new Set((requests || []).map((item: any) => item.user_id).filter(Boolean))]
    if (userIds.length === 0) {
      const empty = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(empty, XLSX.utils.aoa_to_sheet([["No annual leave requests matched the selected filters."]]), "Annual Leave")
      const buffer = XLSX.write(empty, { type: "buffer", bookType: "xlsx" })
      return new NextResponse(buffer, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="Annual_Leave_Export_${new Date().toISOString().slice(0, 10)}.xlsx"` } })
    }

    const { data: profiles, error: profileError } = await admin
      .from("user_profiles")
      .select("id, first_name, last_name, employee_id, email, phone, position, department_id, assigned_location_id, departments(name, code), geofence_locations!user_profiles_assigned_location_id_fkey(name, address)")
      .in("id", userIds)
    if (profileError) {
      console.error("[v0] Annual export profile query failed:", profileError)
      return NextResponse.json({ error: "Staff profile details could not be loaded for the annual leave export." }, { status: 500 })
    }

    const profileMap = new Map((profiles || []).map((profile: any) => [String(profile.id), profile]))
    const allowedRequests = (requests || []).filter((item: any) => {
      const profile = profileMap.get(String(item.user_id))
      if (!profile) return false
      if (role === "department_head") return String(profile.department_id || "") === String(actor.department_id || "")
      if (role === "regional_manager") return String(profile.assigned_location_id || "") === String(actor.assigned_location_id || "")
      if (requestedDepartment && String(profile.department_id || "") !== requestedDepartment) return false
      if (requestedLocation && String(profile.assigned_location_id || "") !== requestedLocation) return false
      return true
    })

    const rows = allowedRequests.map((item: any) => {
      const profile: any = profileMap.get(String(item.user_id)) || {}
      const department = Array.isArray(profile.departments) ? profile.departments[0] : profile.departments
      const location = Array.isArray(profile.geofence_locations) ? profile.geofence_locations[0] : profile.geofence_locations
      return {
        "Employee ID": profile.employee_id || "",
        "Staff Name": `${profile.first_name || ""} ${profile.last_name || ""}`.trim(),
        Email: profile.email || "",
        Position: profile.position || "",
        Department: department?.name || "",
        "Department Code": department?.code || "",
        Location: location?.name || "",
        "Leave Type": "Annual",
        "Preferred Start": item.preferred_start_date || "",
        "Preferred End": item.preferred_end_date || "",
        "Approved/Adjusted Start": item.adjusted_start_date || "",
        "Approved/Adjusted End": item.adjusted_end_date || "",
        "Days Requested": item.requested_days ?? "",
        "Days Granted": item.adjusted_days ?? item.requested_days ?? "",
        "Entitlement Days": item.leave_entitlement_days ?? item.entitlement_days ?? "",
        "Travel Days": item.travelling_days_added ?? "",
        Status: item.status || "",
        Reason: item.reason || "",
        Submitted: csvDate(item.submitted_at || item.created_at),
        "HOD Reviewed": csvDate(item.hod_reviewed_at),
        "HR Approved": csvDate(item.hr_approved_at),
      }
    })

    const workbook = XLSX.utils.book_new()
    const sheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{ "No matching requests": "No annual leave requests matched the selected filters." }])
    sheet["!cols"] = Object.keys(rows[0] || { "No matching requests": "" }).map((key) => ({ wch: Math.min(Math.max(key.length + 3, 14), 28) }))
    XLSX.utils.book_append_sheet(workbook, sheet, "Annual Leave")
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" })
    const filename = `Annual_Leave_Export_${new Date().toISOString().slice(0, 10)}.xlsx`

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    console.error("[v0] Annual leave export failed:", error)
    return NextResponse.json({ error: "Annual leave export failed" }, { status: 500 })
  }
}
