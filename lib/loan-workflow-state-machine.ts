/**
 * Loan Workflow State Machine
 * 
 * Defines valid state transitions to prevent invalid status changes
 * in the loan workflow and payment tracking system.
 */

export type LoanStatus =
  | "pending_hod"
  | "hod_approved"
  | "hod_rejected"
  | "sent_to_accounts"
  | "rejected_fd"
  | "awaiting_committee"
  | "committee_rejected"
  | "awaiting_hr_terms"
  | "awaiting_director_hr"
  | "approved_director"
  | "director_rejected"
  | "md_final_approved"

export type PaymentStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "completed"

/**
 * Valid status transitions in the loan workflow
 * Maps current status to allowed next statuses
 */
const LOAN_VALID_TRANSITIONS: Record<LoanStatus, LoanStatus[]> = {
  "pending_hod": ["hod_approved", "hod_rejected"],
  "hod_rejected": [], // Terminal state - can be re-submitted as new request
  "hod_approved": ["sent_to_accounts"],
  "sent_to_accounts": ["awaiting_committee", "awaiting_hr_terms", "rejected_fd"],
  "rejected_fd": [], // Terminal state - requires new submission
  "awaiting_committee": ["awaiting_hr_terms", "committee_rejected"],
  "committee_rejected": [], // Terminal state - requires new submission
  "awaiting_hr_terms": ["awaiting_director_hr"],
  "awaiting_director_hr": ["approved_director", "director_rejected"],
  "director_rejected": [], // Terminal state - can be resubmitted
  "approved_director": ["md_final_approved"],
  "md_final_approved": [], // Final state - loan is approved and ready for payment
}

/**
 * Check if a status transition is valid
 */
export function isValidLoanTransition(
  fromStatus: string,
  toStatus: string
): boolean {
  const from = fromStatus as LoanStatus
  const to = toStatus as LoanStatus

  if (!LOAN_VALID_TRANSITIONS[from]) {
    return false
  }

  return LOAN_VALID_TRANSITIONS[from].includes(to)
}

/**
 * Get valid next statuses for a given status
 */
export function getValidNextStatuses(status: string): LoanStatus[] {
  const normalized = status as LoanStatus
  return LOAN_VALID_TRANSITIONS[normalized] || []
}

/**
 * Check if a status is a terminal (end) state
 */
export function isTerminalStatus(status: string): boolean {
  const nextStatuses = getValidNextStatuses(status)
  return nextStatuses.length === 0
}

/**
 * Check if a status is an approval/final state
 */
export function isApprovedStatus(status: string): boolean {
  return status === "md_final_approved"
}

/**
 * Check if a status is a rejection state
 */
export function isRejectionStatus(status: string): boolean {
  return ["hod_rejected", "rejected_fd", "committee_rejected", "director_rejected"].includes(status)
}

/**
 * Get human-readable status name
 */
export function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending_hod: "Awaiting HOD Review",
    hod_approved: "HOD Approved",
    hod_rejected: "Rejected by HOD",
    sent_to_accounts: "Sent to Accounts (FD Review)",
    rejected_fd: "Rejected by Accounts (FD)",
    awaiting_committee: "Awaiting Committee Review",
    committee_rejected: "Rejected by Committee",
    awaiting_hr_terms: "HR Preparing Terms",
    awaiting_director_hr: "Awaiting HR Director Approval",
    approved_director: "HR Director Approved",
    director_rejected: "Rejected by HR Director",
    md_final_approved: "MD Final Approval - Ready for Payment",
  }

  return labels[status] || status
}

/**
 * Get the stage name for a status
 */
export function getStage(status: string): string {
  if (["pending_hod", "hod_approved", "hod_rejected"].includes(status)) return "HOD Review"
  if (["sent_to_accounts", "rejected_fd"].includes(status)) return "Accounts FD Review"
  if (["awaiting_committee", "committee_rejected"].includes(status)) return "Committee Review"
  if (["awaiting_hr_terms", "awaiting_director_hr", "approved_director", "director_rejected"].includes(status))
    return "HR Review"
  if (["md_final_approved"].includes(status)) return "MD Final Approval"
  return "Unknown"
}

/**
 * Get the owner/actor for a status
 */
export function getStatusOwner(status: string): string {
  if (["pending_hod", "hod_approved", "hod_rejected"].includes(status)) return "HOD / Department Head"
  if (["sent_to_accounts", "rejected_fd"].includes(status)) return "Accounts Executive"
  if (["awaiting_committee", "committee_rejected"].includes(status)) return "Loan Committee"
  if (["awaiting_hr_terms", "awaiting_director_hr", "approved_director", "director_rejected"].includes(status))
    return "HR Director / HR Executive"
  if (["md_final_approved"].includes(status)) return "Managing Director"
  return "Unknown"
}

/**
 * Validate a payment status transition
 */
export function isValidPaymentTransition(
  fromStatus: PaymentStatus,
  toStatus: PaymentStatus
): boolean {
  const validTransitions: Record<PaymentStatus, PaymentStatus[]> = {
    pending: ["approved", "rejected", "completed"],
    approved: ["rejected", "completed"],
    rejected: ["pending"], // Can resubmit rejected payments
    completed: [], // Terminal state
  }

  return validTransitions[fromStatus]?.includes(toStatus) ?? false
}

/**
 * Check if both HR and Accounts approvals would result in completion
 */
export function calculatePaymentStatus(
  hrStatus: "pending" | "approved" | "rejected" | null | undefined,
  accountsStatus: "pending" | "approved" | "rejected" | null | undefined
): PaymentStatus {
  hrStatus = hrStatus || "pending"
  accountsStatus = accountsStatus || "pending"

  // If either rejected
  if (hrStatus === "rejected" || accountsStatus === "rejected") {
    return "rejected"
  }

  // If both approved
  if (hrStatus === "approved" && accountsStatus === "approved") {
    return "completed"
  }

  // Otherwise pending
  return "pending"
}

/**
 * Get description of what's needed to move to next stage
 */
export function getNextStepsDescription(status: string): string {
  const descriptions: Record<string, string> = {
    pending_hod: "Awaiting HOD or Department Head approval. HOD will auto-approve after 3 days of inactivity.",
    hod_approved:
      "HOD has approved. Loan will be sent to Accounts for Financial Discipline (FD) review.",
    sent_to_accounts: "Accounts Executive will review the Financial Discipline score. FD score must be >= 39.",
    rejected_fd:
      "Accounts Executive rejected due to low FD score. You can submit a new loan request if circumstances improve.",
    awaiting_committee: "Loan Committee will review the request for final approval.",
    committee_rejected: "Committee rejected the loan. You can appeal or submit a new request.",
    awaiting_hr_terms: "HR is preparing the loan terms and conditions.",
    awaiting_director_hr:
      "Awaiting HR Director or HR Executive approval of the loan terms. They will finalize the agreement.",
    approved_director:
      "HR Director has approved. Awaiting Managing Director's final stamp of approval.",
    director_rejected:
      "HR Director rejected the loan. You can appeal the decision or submit a new request.",
    md_final_approved:
      "Managing Director has approved! Loan is now ready for payment. Submit payment evidence to complete the process.",
  }

  return descriptions[status] || "Please contact HR for more information."
}

/**
 * Validate approval workflow completion
 */
export function isApprovalComplete(loanStatus: string, paymentStatus?: PaymentStatus): boolean {
  const loanComplete = loanStatus === "md_final_approved"
  const paymentComplete = !paymentStatus || paymentStatus === "completed"

  return loanComplete && paymentComplete
}
