import { describe, expect, it } from "vitest"
import {
  EXECUTIVE_HR_STATUSES,
  FORWARDED_TO_EXECUTIVE_HR_STATUS,
  HR_RECORDS_REFERENCE_STATUS,
  MD_APPROVAL_STATUS,
  isWithExecutiveHr,
  statusAfterExecutiveApproval,
} from "../lib/loan-approval-stages"

describe("loan approval stages", () => {
  it("sends an HR Loan Office forward to Executive HR, never straight to the MD", () => {
    expect(FORWARDED_TO_EXECUTIVE_HR_STATUS).toBe("awaiting_hr_executives")
    expect(FORWARDED_TO_EXECUTIVE_HR_STATUS).not.toBe(MD_APPROVAL_STATUS)
    expect(isWithExecutiveHr(FORWARDED_TO_EXECUTIVE_HR_STATUS)).toBe(true)
  })

  it("keeps the MD stage out of the Executive HR queue", () => {
    expect(EXECUTIVE_HR_STATUSES).not.toContain(MD_APPROVAL_STATUS)
    expect(isWithExecutiveHr(MD_APPROVAL_STATUS)).toBe(false)
  })

  it("keeps a loan Executive HR already approved out of the Executive HR queue", () => {
    for (const status of [HR_RECORDS_REFERENCE_STATUS, MD_APPROVAL_STATUS, "approved_director", "director_rejected"]) {
      expect(isWithExecutiveHr(status)).toBe(false)
    }
  })

  it("treats the legacy review status as the same Executive HR stage", () => {
    expect(isWithExecutiveHr("pending_hr_executive_review")).toBe(true)
    expect(isWithExecutiveHr("awaiting_hr_executives")).toBe(true)
  })

  it("does not treat empty or unknown statuses as Executive HR", () => {
    expect(isWithExecutiveHr(null)).toBe(false)
    expect(isWithExecutiveHr(undefined)).toBe(false)
    expect(isWithExecutiveHr("")).toBe(false)
    expect(isWithExecutiveHr("sent_to_accounts")).toBe(false)
  })
})

describe("statusAfterExecutiveApproval", () => {
  it("goes to HR Records when no reference is locked", () => {
    expect(statusAfterExecutiveApproval({ memo_reference_locked: false, reference_number: "QCC/HRD/SWL/V.2/1153" })).toBe(HR_RECORDS_REFERENCE_STATUS)
    expect(statusAfterExecutiveApproval({})).toBe(HR_RECORDS_REFERENCE_STATUS)
  })

  it("goes straight to the MD when HR Records has already locked the reference", () => {
    expect(statusAfterExecutiveApproval({ memo_reference_locked: true, reference_number: "QCC/HRD/SWL/V.2/1153" })).toBe(MD_APPROVAL_STATUS)
  })

  it("does not trust a lock flag that has no reference behind it", () => {
    expect(statusAfterExecutiveApproval({ memo_reference_locked: true, reference_number: "  " })).toBe(HR_RECORDS_REFERENCE_STATUS)
    expect(statusAfterExecutiveApproval({ memo_reference_locked: true, reference_number: null })).toBe(HR_RECORDS_REFERENCE_STATUS)
  })
})
