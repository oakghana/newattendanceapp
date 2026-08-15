import { describe, expect, it } from "vitest"
import { REGIONAL_LEAVE_STAGES, SELF_LEAVE_STAGES, getLeaveWorkflowView, resolveSelfLeaveRoute, routeLeave } from "../lib/hr-workflow"

describe("regional self-leave workflow", () => {
  it("routes every Regional Manager leave type directly to HR Leave Office", () => {
    for (const leaveType of ["annual", "casual", "sick", "study"]) {
      const route = resolveSelfLeaveRoute({ role: "regional_manager", locationName: "Kumasi Regional Office" })
      expect(route.isSelfLeave).toBe(true)
      expect(route.firstStage).toBe(SELF_LEAVE_STAGES.hrLeaveOffice)
      expect(leaveType).toBeTruthy()
    }
  })

  it("routes non-regional HOD self-leave directly to HR Leave Office", () => {
    expect(resolveSelfLeaveRoute({ role: "department_head", locationName: "QCC Head Office" }).firstStage)
      .toBe(SELF_LEAVE_STAGES.hrLeaveOffice)
    expect(resolveSelfLeaveRoute({ role: "department_head", locationName: "Kumasi Regional Office" })).toEqual({
      isSelfLeave: false,
      route: null,
      firstStage: null,
    })
  })

  it("does not put Regional HR into the self-leave route", () => {
    const route = resolveSelfLeaveRoute({ role: "regional_manager", locationName: "Kumasi Regional Office" })
    expect(route.reason).toContain("bypasses endorsement and Regional HR")
  })
})

describe("workflow status labels", () => {
  it("shows the correct self-leave stages", () => {
    expect(getLeaveWorkflowView({ workflowRoute: "self_leave", status: "pending_hr_leave_processing", workflowStage: "hr_leave_office" }).statusLabel)
      .toBe("Awaiting HR Leave Office Adjustment")
    expect(getLeaveWorkflowView({ workflowRoute: "self_leave", status: "hr_office_forwarded", workflowStage: "hr_executive" }).statusLabel)
      .toBe("Pending HR Executive Signing")
  })
})

describe("regional non-annual leave workflow", () => {
  it("routes a regional staff request to Regional HR before Regional Manager", () => {
    const route = routeLeave({
      leaveType: "casual",
      locationName: "Kumasi Regional Office",
      hasRegionalOffice: true,
    })
    expect(route.route).toBe("regional")
    expect(route.firstStage).toBe("pending_regional_hr_review")
  })

  it("keeps every ordinary regional leave type on the Regional HR then Regional Manager path", () => {
    for (const leaveType of ["annual", "casual", "sick", "study", "compassionate"]) {
      expect(routeLeave({ leaveType, locationName: "Kumasi Regional Office", hasRegionalOffice: true }).firstStage)
        .toBe(REGIONAL_LEAVE_STAGES.regionalHrReview)
    }
  })

  it("routes compassionate leave through Regional HR", () => {
    expect(routeLeave({ leaveType: "compassionate", locationName: "Kumasi Regional Office", hasRegionalOffice: true })).toEqual({
      route: "regional",
      firstStage: REGIONAL_LEAVE_STAGES.regionalHrReview,
    })
  })

  it("does not silently fall back to HOD when the regional office assignment is missing", () => {
    const route = routeLeave({ leaveType: "compassionate", locationName: "Kumasi Regional Office", hasRegionalOffice: false })
    expect(route.route).toBe("regional")
    expect(route.firstStage).toBe(REGIONAL_LEAVE_STAGES.regionalHrReview)
    expect(route.reason).toContain("Regional HR assignment is required")
  })

  it("routes Head Office requests to HOD and keeps them out of Regional HR", () => {
    const route = routeLeave({
      leaveType: "casual",
      locationName: "HEAD OFFICE SWANZY ARCADE",
      hasRegionalOffice: true,
    })
    expect(route).toEqual({
      route: "legacy",
      firstStage: null,
      reason: "This location uses the non-regional/head-office workflow.",
    })
  })

  it("recognizes common non-regional location variants", () => {
    for (const locationName of ["QCC Head Office", "Head Office, Accra", "Nsawam Archive Center", "Awutu Stores"]) {
      expect(routeLeave({ leaveType: "casual", locationName, hasRegionalOffice: true }).route).toBe("legacy")
    }
  })

  it("keeps the regional route on Regional HR then Regional Manager", () => {
    const route = routeLeave({
      leaveType: "sick",
      locationName: "Kumasi Regional Office",
      hasRegionalOffice: true,
    })

    expect(route).toEqual({
      route: "regional",
      firstStage: REGIONAL_LEAVE_STAGES.regionalHrReview,
    })

    const stages = [
      REGIONAL_LEAVE_STAGES.regionalHrReview,
      REGIONAL_LEAVE_STAGES.regionalManagerApproval,
    ]
    expect(stages).not.toContain("pending_hod_review")
    expect(stages).not.toContain("pending_hr_executive_approval")
    expect(stages[0]).toBe("pending_regional_hr_review")
    expect(stages[1]).toBe("pending_regional_manager_approval")
  })
})
