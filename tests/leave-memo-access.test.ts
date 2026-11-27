import { describe, expect, it } from "vitest"
import { getLeaveMemoAccess } from "../lib/leave-memo-access"

const memo = {
  status: "hr_approved",
  workflowStage: "md_approved",
  workflowRoute: "legacy",
  leaveType: "annual",
  leaveStartDate: "2026-12-15",
  staffCategory: "Manager",
  staffPosition: "District Manager",
  memoReference: "QCC/HRD/AL/1001",
  memoReferenceLocked: true,
}

const now = new Date("2026-12-01T12:00:00Z")

describe("leave memo availability", () => {
  it("keeps a memo unavailable before the final approval chain is complete", () => {
    expect(getLeaveMemoAccess({ ...memo, status: "hod_approved" }, now).canDownload).toBe(false)
  })

  it("requires MD approval for manager-category leave", () => {
    const result = getLeaveMemoAccess({ ...memo, workflowStage: "md_approval_pending" }, now)
    expect(result.canDownload).toBe(false)
    expect(result.reason).toContain("Managing Director")
  })

  it("opens annual leave memos in the 14 days before the approved start date", () => {
    expect(getLeaveMemoAccess(memo, now).canDownload).toBe(true)
    expect(getLeaveMemoAccess({ ...memo, leaveStartDate: "2026-12-16" }, now).canDownload).toBe(false)
  })

  it("requires a locked official reference for non-regional memos", () => {
    const result = getLeaveMemoAccess({ ...memo, staffCategory: "Junior", memoReferenceLocked: false }, now)
    expect(result.canDownload).toBe(false)
    expect(result.reason).toContain("HR Records")
  })

  it("does not require the non-regional HR Records reference lock for regional memos", () => {
    const result = getLeaveMemoAccess({
      ...memo,
      status: "approved",
      staffCategory: "Junior",
      workflowRoute: "regional",
      leaveType: "casual",
      memoReference: null,
      memoReferenceLocked: false,
    }, now)
    expect(result.canDownload).toBe(true)
  })
})
