import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"

type FailureRow = {
  id: string
  user_id: string | null
  action: string
  created_at: string
  ip_address: string | null
  new_values: any
}

const ALLOWED_ROLES = new Set(["admin"])
const FAILURE_ACTIONS = [
  "check_in_failed",
  "offpremises_checkin_failed",
  "check_out_failed",
  "offpremises_checkout_failed",
  "qr_check_out_failed",
  "auto_checkout_failed",
  "force_checkout_after_failed_attempts",
]

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    const admin = await createAdminClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .single()
    if (!profile || !ALLOWED_ROLES.has(profile.role))
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })

    const body = await request.json()
    const { ids, clearAll, startDate, endDate } = body as {
      ids?: string[]
      clearAll?: boolean
      startDate?: string
      endDate?: string
    }

    if (clearAll) {
      // Delete all failure audit_log rows (optionally within date range)
      let q = admin.from("audit_logs").delete().in("action", FAILURE_ACTIONS)
      if (startDate) q = q.gte("created_at", `${startDate}T00:00:00`)
      if (endDate) q = q.lte("created_at", `${endDate}T23:59:59`)
      const { error } = await q
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ success: true, message: "All matching failure records cleared." })
    }

    if (ids && ids.length > 0) {
      const { error } = await admin
        .from("audit_logs")
        .delete()
        .in("id", ids)
        .in("action", FAILURE_ACTIONS)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ success: true, message: `${ids.length} record(s) deleted.` })
    }

    return NextResponse.json({ error: "No ids or clearAll flag provided." }, { status: 400 })
  } catch (err) {
    console.error("[checkin-failures DELETE]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
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

    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("id, role, department_id")
      .eq("id", user.id)
      .single()

    if (profileError || !profile || !ALLOWED_ROLES.has(profile.role)) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const page = Math.max(1, Number.parseInt(searchParams.get("page") || "1", 10))
    const limit = Math.min(500, Math.max(1, Number.parseInt(searchParams.get("limit") || "100", 10)))
    const startDate = searchParams.get("start_date")
    const endDate = searchParams.get("end_date")
    const reasonQuery = (searchParams.get("reason") || "").trim().toLowerCase()
    const typeFilter = searchParams.get("type") || "all"
    const departmentFilter = searchParams.get("department_id") || "all"

    let query = admin
      .from("audit_logs")
      .select("id, user_id, action, created_at, ip_address, new_values", { count: "exact" })
      .in("action", FAILURE_ACTIONS)
      .order("created_at", { ascending: false })

    if (startDate) query = query.gte("created_at", `${startDate}T00:00:00`)
    if (endDate) query = query.lte("created_at", `${endDate}T23:59:59`)
    if (typeFilter === "manual") query = query.in("action", ["check_in_failed", "check_out_failed"])
    if (typeFilter === "offpremises") query = query.in("action", ["offpremises_checkin_failed", "offpremises_checkout_failed"])
    if (typeFilter === "checkin") query = query.in("action", ["check_in_failed", "offpremises_checkin_failed"])
    if (typeFilter === "checkout") query = query.in("action", ["check_out_failed", "offpremises_checkout_failed", "qr_check_out_failed", "auto_checkout_failed", "force_checkout_after_failed_attempts"])
    if (typeFilter === "qr_checkout") query = query.eq("action", "qr_check_out_failed")
    if (typeFilter === "auto_checkout") query = query.eq("action", "auto_checkout_failed")

    const from = (page - 1) * limit
    const to = from + limit - 1
    const { data: rawRows, error: rowsError, count } = await query.range(from, to)

    if (rowsError) {
      console.error("[v0] Failed to fetch check-in failure rows:", rowsError)
      return NextResponse.json({ error: "Failed to fetch records" }, { status: 500 })
    }

    const rows = (rawRows || []) as FailureRow[]
    const userIds = [...new Set(rows.map((row) => row.user_id).filter(Boolean) as string[])]

    const { data: users } = userIds.length
        ? await admin
          .from("user_profiles")
          .select("id, employee_id, first_name, last_name, role, department_id, departments(id, name, code)")
          .in("id", userIds)
      : { data: [] as any[] }

    const userMap = new Map((users || []).map((u: any) => [u.id, u]))

    const normalized = rows
      .map((row) => {
        const details = row.new_values || {}
        const userProfile = row.user_id ? userMap.get(row.user_id) : null
        const fullName = userProfile
          ? `${userProfile.first_name || ""} ${userProfile.last_name || ""}`.trim() || "Unknown User"
          : details?.user_profile_snapshot?.full_name || "Unknown User"

        return {
          id: row.id,
          created_at: row.created_at,
          user_id: row.user_id,
          employee_id: userProfile?.employee_id || details?.user_profile_snapshot?.employee_id || "N/A",
          full_name: fullName,
          role: userProfile?.role || details?.user_profile_snapshot?.role || "unknown",
          department_id: userProfile?.department_id || null,
          department_name:
            userProfile?.departments?.name || details?.user_profile_snapshot?.department_name || "Unassigned",
          attempt_type:
            details?.attempt_type ||
            (row.action === "offpremises_checkin_failed"
              ? "offpremises_checkin"
              : row.action === "offpremises_checkout_failed"
                ? "offpremises_checkout"
                : row.action === "check_out_failed"
                  ? "manual_checkout"
                  : row.action === "qr_check_out_failed"
                    ? "qr_checkout"
                    : row.action === "auto_checkout_failed"
                      ? "auto_checkout"
                      : row.action === "force_checkout_after_failed_attempts"
                        ? "auto_checkout_recovery"
                      : "manual_checkin"),
          failure_reason:
            details?.failure_reason ||
            (row.action === "force_checkout_after_failed_attempts" ? "auto_force_checkout_after_failed_attempts" : "unknown"),
          failure_message:
            details?.failure_message ||
            (row.action === "force_checkout_after_failed_attempts"
              ? "System auto check-out completed after repeated failed checkout attempts."
              : ""),
          nearest_location_name: details?.nearest_location_name || details?.check_out_location_name || "Unknown",
          nearest_location_distance_m:
            typeof details?.nearest_location_distance_m === "number" ? details.nearest_location_distance_m : null,
          latitude: typeof details?.latitude === "number" ? details.latitude : null,
          longitude: typeof details?.longitude === "number" ? details.longitude : null,
          accuracy: typeof details?.accuracy === "number" ? details.accuracy : null,
          device_type: details?.device_type || "unknown",
          ip_address: row.ip_address,
        }
      })
      .filter((item) => {
        if (profile.role === "department_head" && profile.department_id) {
          return item.department_id === profile.department_id
        }
        if (departmentFilter !== "all") {
          return item.department_id === departmentFilter
        }
        return true
      })
      .filter((item) => {
        if (!reasonQuery) return true
        return (
          item.failure_reason.toLowerCase().includes(reasonQuery) ||
          item.failure_message.toLowerCase().includes(reasonQuery)
        )
      })

    const summaryMap = new Map<string, { count: number; user: any; lastAttemptAt: string }>()
    const reasonMap = new Map<string, number>()

    for (const row of normalized) {
      const key = row.user_id || row.employee_id || row.full_name
      const existing = summaryMap.get(key)
      if (!existing) {
        summaryMap.set(key, { count: 1, user: row, lastAttemptAt: row.created_at })
      } else {
        existing.count += 1
        if (new Date(row.created_at).getTime() > new Date(existing.lastAttemptAt).getTime()) {
          existing.lastAttemptAt = row.created_at
        }
      }

      const reason = row.failure_reason || "unknown"
      reasonMap.set(reason, (reasonMap.get(reason) || 0) + 1)
    }

    const byUser = Array.from(summaryMap.values())
      .map((entry) => ({
        user_id: entry.user.user_id,
        employee_id: entry.user.employee_id,
        full_name: entry.user.full_name,
        department_name: entry.user.department_name,
        role: entry.user.role,
        attempts: entry.count,
        last_attempt_at: entry.lastAttemptAt,
      }))
      .sort((a, b) => b.attempts - a.attempts)

    const byReason = Array.from(reasonMap.entries())
      .map(([reason, attempts]) => ({ reason, attempts }))
      .sort((a, b) => b.attempts - a.attempts)

    return NextResponse.json({
      success: true,
      data: {
        records: normalized,
        summary: {
          totalAttempts: normalized.length,
          uniqueUsers: byUser.length,
          byUser,
          byReason,
        },
      },
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    })
  } catch (error) {
    console.error("[v0] Check-in failures API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
