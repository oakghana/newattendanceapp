export const ACTIVE_REPAYMENT_STATUS_VALUES = ["not_started", "active", "on_track", "due_soon", "overdue"]
export const CLEAR_REPAYMENT_STATUS_VALUES = ["completed", "cleared", "fully_recovered", "paid_off"]

export function isLoanRepaymentOutstanding(row?: Partial<{ status?: string | null; repayment_status?: string | null }>): boolean {
  const status = String(row?.status ?? "").trim().toLowerCase()
  const repaymentStatus = String(row?.repayment_status ?? "").trim().toLowerCase()

  if (!status && !repaymentStatus) return false

  if (["payment_completed", "fully_recovered", "cleared", "settled"].includes(status)) return false
  if (CLEAR_REPAYMENT_STATUS_VALUES.includes(repaymentStatus)) return false

  if (ACTIVE_REPAYMENT_STATUS_VALUES.includes(repaymentStatus)) return true

  return [
    "pending_hod",
    "awaiting_hr_terms",
    "awaiting_committee",
    "hod_approved",
    "approved_director",
    "sent_to_accounts",
    "staff_receiving_funds",
    "partially_recovered",
    "disbursed",
    "processed",
  ].includes(status)
}
