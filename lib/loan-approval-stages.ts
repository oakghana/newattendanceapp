/**
 * Loan approval stages after HR Loan Office, in order:
 *
 *   awaiting_hr_executives  ->  pending_hr_records_reference  ->  awaiting_director_hr  ->  approved_director
 *   (Executive HR review)       (HR Records reference)            (Managing Director)      (MD approved)
 *
 * Each status means exactly one office owns the loan. "awaiting_director_hr" must never be
 * used for a loan Executive HR has not reviewed, or it appears in the MD Approval Hub early
 * and in the Executive HR queue after Executive HR has already approved it.
 */

/** Both mean "with Executive HR". pending_hr_executive_review is a legacy value, read but never written. */
export const EXECUTIVE_HR_STATUSES: string[] = ["awaiting_hr_executives", "pending_hr_executive_review"]

/** Status HR Loan Office forwarding writes: the loan goes to Executive HR, not the MD. */
export const FORWARDED_TO_EXECUTIVE_HR_STATUS = "awaiting_hr_executives"

export const HR_RECORDS_REFERENCE_STATUS = "pending_hr_records_reference"

/** The only status listed as pending in the MD Approval Hub. */
export const MD_APPROVAL_STATUS = "awaiting_director_hr"

export function isWithExecutiveHr(status: string | null | undefined): boolean {
  return EXECUTIVE_HR_STATUSES.includes(String(status || ""))
}

/**
 * Where a loan goes when Executive HR approves it. HR Records can only advance a loan whose
 * reference is not locked yet, so a loan that already carries a locked reference goes straight
 * to the MD instead of waiting at a step that could never move it.
 */
export function statusAfterExecutiveApproval(loan: {
  memo_reference_locked?: boolean | null
  reference_number?: string | null
}): string {
  const referenceLocked = Boolean(loan.memo_reference_locked) && Boolean(String(loan.reference_number || "").trim())
  return referenceLocked ? MD_APPROVAL_STATUS : HR_RECORDS_REFERENCE_STATUS
}
