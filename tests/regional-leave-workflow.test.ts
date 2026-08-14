import { describe, expect, it } from "vitest"
import { REGIONAL_LEAVE_STAGES, routeLeave } from "../lib/hr-workflow"

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

  it("submits through Regional HR adjustment then Regional Manager approval without HOD or HR Executive stages", () => {
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
