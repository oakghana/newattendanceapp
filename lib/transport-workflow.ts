/** Transport workflow helpers — UI/API only; does not touch auth. */

export type TransportSlaTone = "ok" | "watch" | "overdue" | "terminal"

export const REGIONAL_STAGE_ORDER = [
  "submitted",
  "regional_manager_endorsement",
  "managing_director_approval",
  "hr_executive_signing",
  "hr_records_review",
  "referenced",
  "transport_manager_assignment",
  "chief_driver_assignment",
  "assigned",
  "completed",
  "closed",
  "regional_hr_correction",
] as const

export const TERMINAL_TRANSPORT_STAGES = new Set(["completed", "closed", "rejected"])

export function transportStageLabel(stage?: string | null): string {
  const value = String(stage || "submitted")
  if (value === "referenced") return "Referenced (ready to assign)"
  if (value === "hr_executive_signing") return "HR Executive signing"
  if (value === "regional_manager_endorsement") return "Regional Manager endorsement"
  if (value === "managing_director_approval") return "Managing Director approval"
  if (value === "transport_manager_assignment") return "Transport Manager assignment"
  if (value === "chief_driver_assignment") return "Chief Driver assignment"
  if (value === "regional_hr_correction") return "Regional HR correction"
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Days since last update (or created_at). */
export function transportAgeDays(updatedAt?: string | null, createdAt?: string | null, now = Date.now()): number {
  const stamp = updatedAt || createdAt
  if (!stamp) return 0
  const t = new Date(stamp).getTime()
  if (Number.isNaN(t)) return 0
  return Math.max(0, Math.floor((now - t) / (24 * 60 * 60 * 1000)))
}

/**
 * SLA badge for open requests:
 * - ok: 0–2 days at current stage
 * - watch: 3–4 days
 * - overdue: 5+ days
 */
export function transportSla(input: {
  workflowStage?: string | null
  status?: string | null
  updatedAt?: string | null
  createdAt?: string | null
  now?: number
}): { days: number; tone: TransportSlaTone; label: string } {
  const stage = String(input.workflowStage || "")
  const status = String(input.status || "")
  if (
    TERMINAL_TRANSPORT_STAGES.has(stage) ||
    ["rejected", "completed", "closed"].includes(status)
  ) {
    return { days: 0, tone: "terminal", label: "Closed" }
  }
  const days = transportAgeDays(input.updatedAt, input.createdAt, input.now)
  if (days >= 5) return { days, tone: "overdue", label: `${days}d overdue` }
  if (days >= 3) return { days, tone: "watch", label: `${days}d waiting` }
  return { days, tone: "ok", label: days <= 0 ? "Today" : `${days}d` }
}

/** Stages that typically need action from a given normalized role. */
export function deskStagesForRole(normalizedRole: string): string[] {
  const role = String(normalizedRole || "").toLowerCase()
  if (role === "regional_manager") return ["regional_manager_endorsement"]
  if (role === "managing_director") return ["managing_director_approval"]
  if (["hr", "hr_executive", "hr_executive_officer", "manager_hr", "director_hr"].includes(role)) {
    return ["hr_executive_signing"]
  }
  if (["hr_records", "hr_records_officer", "hr_records_manager"].includes(role)) {
    return ["hr_records_review", "referenced"]
  }
  if (role === "transport_manager" || role === "admin" || role === "administrator" || role === "it-admin" || role === "it_admin") {
    return ["referenced", "transport_manager_assignment", "assigned"]
  }
  if (role === "chief_driver") return ["chief_driver_assignment", "assigned"]
  if (["regional_hr", "regional_hr_office", "regional_hr_officer"].includes(role)) {
    return ["regional_hr_correction", "regional_manager_endorsement"]
  }
  return []
}

export function isAssignableRegionalStage(stage?: string | null): boolean {
  return ["referenced", "transport_manager_assignment"].includes(String(stage || ""))
}

export function isCompletableTransportStage(stage?: string | null, status?: string | null): boolean {
  return String(stage || "") === "assigned" || String(status || "") === "assigned"
}

export function formatTransportEventAction(action?: string | null): string {
  return String(action || "update")
    .replace(/^transport_/, "")
    .replace(/^bulk_/, "bulk ")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
}
