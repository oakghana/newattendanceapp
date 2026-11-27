export interface LeaveMemoAccessInput {
  status: string | null | undefined
  workflowStage: string | null | undefined
  leaveType: string | null | undefined
  leaveStartDate: string | null | undefined
  staffCategory: string | null | undefined
  staffPosition?: string | null
  memoReference: string | null | undefined
  memoReferenceLocked: boolean | null | undefined
}

export interface LeaveMemoAccessResult {
  canDownload: boolean
  reason: string | null
  daysUntilStart: number | null
}

const FINAL_LEAVE_STATUSES = new Set(["approved", "hr_approved", "regional_manager_approved"])
const ANNUAL_LEAVE_TYPES = new Set(["annual", "annual_leave", "annual leave"])

export function isManagerLeaveCategory(staffCategory?: string | null, position?: string | null) {
  const category = String(staffCategory || "").trim().toLowerCase().replace(/[\s-]+/g, "_")
  const jobTitle = String(position || "").trim().toLowerCase()
  return category === "manager" || category === "management" || jobTitle.includes("manager")
}

function daysUntilDate(dateValue: string, now: Date) {
  const match = dateValue.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  const startUtc = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  return Math.floor((startUtc - todayUtc) / 86_400_000)
}

function formatDate(dateValue: string) {
  const [year, month, day] = dateValue.split("-").map(Number)
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  })
}

export function getLeaveMemoAccess(
  input: LeaveMemoAccessInput,
  now = new Date(),
): LeaveMemoAccessResult {
  const status = String(input.status || "").toLowerCase()
  const isManager = isManagerLeaveCategory(input.staffCategory, input.staffPosition)
  const workflowStage = String(input.workflowStage || "").toLowerCase()

  if (!FINAL_LEAVE_STATUSES.has(status)) {
    return { canDownload: false, reason: "The required HOD or Regional Manager and HR Executive approvals are not complete yet.", daysUntilStart: null }
  }

  if (isManager && workflowStage !== "md_approved") {
    return { canDownload: false, reason: "This manager-category leave is waiting for final Managing Director approval.", daysUntilStart: null }
  }

  if (!String(input.memoReference || "").trim() || input.memoReferenceLocked !== true) {
    return { canDownload: false, reason: "HR Records must enter and lock the official memo reference first.", daysUntilStart: null }
  }

  const leaveType = String(input.leaveType || "").trim().toLowerCase().replace(/_/g, " ")
  if (!ANNUAL_LEAVE_TYPES.has(leaveType) && !ANNUAL_LEAVE_TYPES.has(String(input.leaveType || "").trim().toLowerCase())) {
    return { canDownload: true, reason: null, daysUntilStart: null }
  }

  const startDate = String(input.leaveStartDate || "").slice(0, 10)
  const daysUntilStart = daysUntilDate(startDate, now)
  if (daysUntilStart === null) {
    return { canDownload: false, reason: "The approved annual leave start date is unavailable.", daysUntilStart: null }
  }
  if (daysUntilStart < 0) {
    return { canDownload: false, reason: "The annual leave start date has passed; this memo is no longer available for pre-leave download.", daysUntilStart }
  }
  if (daysUntilStart > 14) {
    const opensAt = new Date(`${startDate}T00:00:00Z`)
    opensAt.setUTCDate(opensAt.getUTCDate() - 14)
    return {
      canDownload: false,
      reason: `Available from ${formatDate(opensAt.toISOString().slice(0, 10))}, 14 days before leave starts.`,
      daysUntilStart,
    }
  }

  return { canDownload: true, reason: null, daysUntilStart }
}
