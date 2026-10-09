import { NextRequest, NextResponse } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { calculateRequestedDays, isRegionalHrOfficerRole } from "@/lib/leave-planning"
import { isRegionalManagerScopeMatch, resolveOwnedLocationIdsForRegionalOffice } from "@/lib/regional-manager-scope"
import { sendWebPushToUsers } from "@/lib/web-push"

// Once a request is decided or locked, its dates can no longer be changed.
const CLOSED_STATUSES = new Set([
  "approved",
  "hr_approved",
  "rejected",
  "hr_rejected",
  "hod_rejected",
  "manager_rejected",
  "regional_rejected",
  "withdrawn",
  "cancelled",
])

function normalizeRole(role: unknown) {
  return String(role || "").toLowerCase().trim().replace(/[-\s]+/g, "_")
}

function roleLabel(role: string) {
  if (role === "district_officer") return "District Officer"
  if (role === "department_head") return "Head of Department"
  if (role === "regional_manager") return "Regional Manager"
  if (role === "admin" || role === "administrator") return "Management"
  return "Regional HR Office"
}

function fmt(date: unknown) {
  const d = new Date(String(date || ""))
  return Number.isNaN(d.getTime())
    ? String(date || "")
    : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
}

function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(value).getTime())
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const admin = await createAdminClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: profile } = await admin
      .from("user_profiles")
      .select("id, role, first_name, last_name, assigned_location_id, region_id")
      .eq("id", user.id)
      .maybeSingle()
    if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 })

    const role = normalizeRole(profile.role)
    const isAdmin = role === "admin" || role === "administrator"
    const isDistrictOfficer = role === "district_officer"
    const isRegionalHr = isRegionalHrOfficerRole(profile.role)
    const isRegionalManager = role === "regional_manager"
    const isHod = role === "department_head"
    if (!isAdmin && !isDistrictOfficer && !isRegionalHr && !isRegionalManager && !isHod) {
      return NextResponse.json({ error: "You are not allowed to change leave dates." }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const requestId = String(body?.leave_plan_request_id || "")
    const start = String(body?.start_date || "")
    const end = String(body?.end_date || "")
    const reason = String(body?.reason || "").trim()

    if (!requestId) return NextResponse.json({ error: "leave_plan_request_id is required." }, { status: 400 })
    if (!isIsoDate(start) || !isIsoDate(end)) {
      return NextResponse.json({ error: "Enter a valid start date and end date." }, { status: 400 })
    }
    if (end < start) {
      return NextResponse.json({ error: "The end date cannot be before the start date." }, { status: 400 })
    }
    if (reason.length < 5) {
      return NextResponse.json({ error: "Give a reason for the change (at least 5 characters)." }, { status: 400 })
    }
    const days = calculateRequestedDays(start, end)
    if (!days || days <= 0) {
      return NextResponse.json({ error: "The selected dates give zero leave days." }, { status: 400 })
    }

    const { data: existing, error: fetchError } = await admin
      .from("leave_plan_requests")
      .select(
        "id, user_id, status, leave_type_key, preferred_start_date, preferred_end_date, requested_days, hr_approved_at, memo_reference_locked, date_change_original_start, date_change_original_end, user_profiles:user_id(assigned_location_id, region_id)",
      )
      .eq("id", requestId)
      .maybeSingle()
    if (fetchError) throw fetchError
    if (!existing) return NextResponse.json({ error: "Leave request not found." }, { status: 404 })

    const status = String((existing as any).status || "")
    if (CLOSED_STATUSES.has(status) || (existing as any).hr_approved_at || (existing as any).memo_reference_locked) {
      return NextResponse.json(
        { error: "This leave request has already been decided, so its dates can no longer be changed." },
        { status: 409 },
      )
    }

    const staffProfile = Array.isArray((existing as any).user_profiles)
      ? (existing as any).user_profiles[0]
      : (existing as any).user_profiles
    const staffUserId = String((existing as any).user_id)

    if (!isAdmin) {
      let inScope = false
      if (isDistrictOfficer) {
        const officerLocationId = String(profile.assigned_location_id || "")
        const targetLocationId = String(staffProfile?.assigned_location_id || "")
        const [{ data: officerLocation }, { data: targetLocation }] = await Promise.all([
          admin.from("geofence_locations").select("name").eq("id", officerLocationId).maybeSingle(),
          admin.from("geofence_locations").select("name, parent_location_id").eq("id", targetLocationId).maybeSingle(),
        ])
        const base = String(officerLocation?.name || "").toLowerCase().split(/\s+/)[0]
        inScope =
          Boolean(officerLocationId) &&
          (targetLocationId === officerLocationId ||
            String(targetLocation?.parent_location_id || "") === officerLocationId ||
            Boolean(base && String(targetLocation?.name || "").toLowerCase().startsWith(`${base} `)))
      } else if (isRegionalHr || isRegionalManager) {
        const owned = await resolveOwnedLocationIdsForRegionalOffice(admin, profile.assigned_location_id, profile.region_id)
        inScope = isRegionalManagerScopeMatch(
          profile.region_id,
          owned,
          staffProfile?.assigned_location_id,
          staffProfile?.region_id,
        )
      } else if (isHod) {
        const { data: linkage } = await admin
          .from("loan_hod_linkages")
          .select("id")
          .eq("hod_user_id", user.id)
          .eq("staff_user_id", staffUserId)
          .maybeSingle()
        inScope = Boolean(linkage)
      }
      if (!inScope) {
        return NextResponse.json({ error: "This staff member is outside your assigned scope." }, { status: 403 })
      }
    }

    const now = new Date().toISOString()
    // Remember the dates staff originally asked for, but never overwrite them
    // on a second change so the history stays meaningful.
    const originalStart = (existing as any).date_change_original_start || (existing as any).preferred_start_date || null
    const originalEnd = (existing as any).date_change_original_end || (existing as any).preferred_end_date || null

    const coreUpdate = {
      preferred_start_date: start,
      preferred_end_date: end,
      requested_days: days,
      adjustment_reason: reason,
      date_change_ack_status: "pending",
      date_change_ack_at: null,
      date_change_ack_note: null,
      date_change_by_role: roleLabel(role),
      date_change_original_start: originalStart,
      date_change_original_end: originalEnd,
      updated_at: now,
    }
    const fullUpdate = { ...coreUpdate, adjusted_start_date: start, adjusted_end_date: end, adjusted_days: days }

    let { data: updated, error: updateError } = await admin
      .from("leave_plan_requests")
      .update(fullUpdate)
      .eq("id", requestId)
      .select("id, status, preferred_start_date, preferred_end_date, requested_days")
      .single()

    if (updateError && /adjusted_(start_date|end_date|days)/i.test(String(updateError.message))) {
      const retry = await admin
        .from("leave_plan_requests")
        .update(coreUpdate)
        .eq("id", requestId)
        .select("id, status, preferred_start_date, preferred_end_date, requested_days")
        .single()
      updated = retry.data
      updateError = retry.error
    }
    if (updateError) {
      console.error("[v0] adjust-dates update failed:", updateError)
      return NextResponse.json({ error: `Could not save the new dates: ${updateError.message}` }, { status: 500 })
    }

    const senderName = `${profile.first_name || ""} ${profile.last_name || ""}`.trim()
    const label = roleLabel(role)
    const message =
      `Your leave dates were changed by the ${label}${senderName ? ` (${senderName})` : ""} ` +
      `from ${fmt((existing as any).preferred_start_date)} - ${fmt((existing as any).preferred_end_date)} ` +
      `to ${fmt(start)} - ${fmt(end)} (${days} day${days === 1 ? "" : "s"}). Reason: ${reason}. ` +
      `The new dates stand. Please open Leave Planning to confirm you have seen them.`

    const { error: notifyError } = await admin.from("staff_notifications").insert({
      recipient_id: staffUserId,
      sender_id: user.id,
      sender_role: String(profile.role || "").slice(0, 50) || "staff",
      sender_label: label.slice(0, 100),
      message,
      notification_type: "leave_date_change",
      is_read: false,
      action_url: "/dashboard/leave-planning",
      data: { leave_plan_request_id: requestId, start_date: start, end_date: end, days, reason },
    })
    if (notifyError) console.error("[v0] adjust-dates notification failed:", notifyError)

    try {
      await sendWebPushToUsers([staffUserId], {
        title: "Your leave dates were changed",
        body: message,
        url: "/dashboard/leave-planning",
        tag: `leave-date-change-${requestId}`,
        kind: "leave-date-change",
      })
    } catch (pushError) {
      console.error("[v0] adjust-dates push failed:", pushError)
    }

    return NextResponse.json({ success: true, request: updated })
  } catch (error: any) {
    console.error("[v0] adjust-dates error:", error)
    return NextResponse.json({ error: String(error?.message || "Could not change the leave dates.") }, { status: 500 })
  }
}
