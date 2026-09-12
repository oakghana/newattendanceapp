import type { SupabaseClient } from "@supabase/supabase-js"
import { findRegionalManagersForLocation, loadLocationHierarchyMap, regionalManagerEligibleLocationIds } from "./regional-manager-scope"
import { isRegionalHrRole } from "./role-capabilities"

type AdminClient = SupabaseClient

// Roles treated as "HR Executive" for excuse duty visibility, plus any HR-department head.
const HR_EXECUTIVE_ROLES = ["hr_executive", "hr_executive_officer", "manager_hr", "director_hr"]

function baseNotification(recipientId: string, senderId: string, message: string, notificationType: string) {
  return {
    recipient_id: recipientId,
    sender_id: senderId,
    sender_role: "system",
    sender_label: "Excuse Duty",
    message,
    notification_type: notificationType,
    is_read: false,
  }
}

async function insertNotifications(admin: AdminClient, rows: ReturnType<typeof baseNotification>[]) {
  if (!rows.length) return
  const { error } = await admin.from("staff_notifications").insert(rows)
  if (error) console.warn("[excuse-duty-notifications] insert failed:", error)
}

async function resolveHodIds(admin: AdminClient, departmentId: string | null): Promise<string[]> {
  if (!departmentId) return []
  const { data } = await admin
    .from("user_profiles")
    .select("id")
    .eq("role", "department_head")
    .eq("department_id", departmentId)
    .eq("is_active", true)
  return (data || []).map((row: any) => String(row.id))
}

async function resolveRmIds(admin: AdminClient, assignedLocationId: string | null): Promise<string[]> {
  if (!assignedLocationId) return []
  const managers = await findRegionalManagersForLocation(admin, assignedLocationId)
  return managers.map((row) => String(row.id))
}

/** Regional HR Office contact covering the staff member's own regional office/district. */
async function resolveRegionalHrIdsForLocation(admin: AdminClient, assignedLocationId: string | null): Promise<string[]> {
  if (!assignedLocationId) return []
  const locations = await loadLocationHierarchyMap(admin, [assignedLocationId])
  const staffLocation = locations.get(String(assignedLocationId)) || { id: String(assignedLocationId) }
  const eligibleIds = regionalManagerEligibleLocationIds(staffLocation, locations)
  if (eligibleIds.length === 0) return []
  const { data } = await admin
    .from("user_profiles")
    .select("id, role")
    .in("assigned_location_id", eligibleIds)
    .eq("is_active", true)
  return (data || []).filter((row: any) => isRegionalHrRole(row.role)).map((row: any) => String(row.id))
}

/** HR Executive roles plus any department head of an HR/Human Resources department. */
async function resolveHrExecutiveIds(admin: AdminClient): Promise<string[]> {
  const [{ data: execRoleUsers }, { data: hrDeptHeads }] = await Promise.all([
    admin.from("user_profiles").select("id").in("role", HR_EXECUTIVE_ROLES).eq("is_active", true),
    admin
      .from("user_profiles")
      .select("id, departments(name)")
      .eq("role", "department_head")
      .eq("is_active", true),
  ])
  const ids = new Set<string>((execRoleUsers || []).map((row: any) => String(row.id)))
  for (const row of hrDeptHeads || []) {
    const deptName = String((row as any).departments?.name || "").toLowerCase()
    if (deptName.includes("hr") || deptName.includes("human resource")) ids.add(String((row as any).id))
  }
  return Array.from(ids)
}

async function resolveAdminIds(admin: AdminClient): Promise<string[]> {
  const { data } = await admin.from("user_profiles").select("id").eq("role", "admin").eq("is_active", true)
  return (data || []).map((row: any) => String(row.id))
}

/**
 * Staff submitted a new excuse duty note → notify their assigned HOD, their
 * Regional Manager (resolved from location, not a blanket broadcast), and
 * whoever handles HR Executive processing.
 */
export async function notifyExcuseDutySubmitted(
  admin: AdminClient,
  opts: {
    staffId: string
    staffName: string
    departmentId: string | null
    assignedLocationId: string | null
    excuseDate: string
    documentType: string
    reason: string
  },
): Promise<void> {
  try {
    const [hodIds, rmIds, regionalHrIds, hrExecIds] = await Promise.all([
      resolveHodIds(admin, opts.departmentId),
      resolveRmIds(admin, opts.assignedLocationId),
      resolveRegionalHrIdsForLocation(admin, opts.assignedLocationId),
      resolveHrExecutiveIds(admin),
    ])

    const recipientIds = new Set<string>([...hodIds, ...rmIds, ...regionalHrIds, ...hrExecIds])
    recipientIds.delete(opts.staffId)

    // Nothing resolved (e.g. no HOD/RM linked yet) — fall back to admins so the request isn't missed.
    if (recipientIds.size === 0) {
      const adminIds = await resolveAdminIds(admin)
      adminIds.forEach((id) => recipientIds.add(id))
    }

    const dateLabel = new Date(opts.excuseDate).toLocaleDateString()
    const message = `${opts.staffName} submitted an excuse duty note for ${dateLabel} (${opts.documentType}). Reason: ${opts.reason}`

    await insertNotifications(
      admin,
      Array.from(recipientIds).map((id) => baseNotification(id, opts.staffId, message, "excuse_duty_submitted")),
    )
  } catch (e) {
    console.warn("[excuse-duty-notifications] notifyExcuseDutySubmitted failed:", e)
  }
}

/** HOD approved (forwards to HR) or rejected → notify staff, and HR Executive if forwarded. */
export async function notifyExcuseDutyHodDecision(
  admin: AdminClient,
  opts: {
    staffId: string
    staffName: string
    reviewerId: string
    reviewerName: string
    decision: "approved" | "rejected"
    excuseDate: string
    notes?: string | null
  },
): Promise<void> {
  try {
    const dateLabel = new Date(opts.excuseDate).toLocaleDateString()
    const staffMessage =
      opts.decision === "approved"
        ? `Your excuse duty note for ${dateLabel} was approved by ${opts.reviewerName} and forwarded to HR for final processing.`
        : `Your excuse duty note for ${dateLabel} was rejected by ${opts.reviewerName}.${opts.notes ? ` Note: ${opts.notes}` : ""}`

    const rows = [baseNotification(opts.staffId, opts.reviewerId, staffMessage, `excuse_duty_hod_${opts.decision}`)]

    if (opts.decision === "approved") {
      const hrExecIds = await resolveHrExecutiveIds(admin)
      const hrMessage = `${opts.staffName}'s excuse duty note for ${dateLabel} was approved by ${opts.reviewerName} and needs final HR processing.`
      for (const id of hrExecIds) {
        if (id !== opts.reviewerId) rows.push(baseNotification(id, opts.reviewerId, hrMessage, "excuse_duty_hr_review_needed"))
      }
    }

    await insertNotifications(admin, rows)
  } catch (e) {
    console.warn("[excuse-duty-notifications] notifyExcuseDutyHodDecision failed:", e)
  }
}

/** HR gave the final decision → notify staff, and the HOD who approved it (FYI). */
export async function notifyExcuseDutyHrDecision(
  admin: AdminClient,
  opts: {
    staffId: string
    staffName: string
    reviewerId: string
    reviewerName: string
    decision: "approved" | "rejected" | "archived"
    excuseDate: string
    hodReviewerId?: string | null
    notes?: string | null
  },
): Promise<void> {
  try {
    const dateLabel = new Date(opts.excuseDate).toLocaleDateString()
    const staffMessage = `Your excuse duty note for ${dateLabel} was ${opts.decision} by HR (${opts.reviewerName}).${opts.notes ? ` Note: ${opts.notes}` : ""}`
    const rows = [baseNotification(opts.staffId, opts.reviewerId, staffMessage, `excuse_duty_hr_${opts.decision}`)]

    if (opts.hodReviewerId && opts.hodReviewerId !== opts.reviewerId) {
      const hodMessage = `${opts.staffName}'s excuse duty note that you approved was ${opts.decision} by HR (${opts.reviewerName}).`
      rows.push(baseNotification(opts.hodReviewerId, opts.reviewerId, hodMessage, "excuse_duty_hr_update"))
    }

    await insertNotifications(admin, rows)
  } catch (e) {
    console.warn("[excuse-duty-notifications] notifyExcuseDutyHrDecision failed:", e)
  }
}
