import { describe, expect, it } from "vitest"
import { REGIONAL_NON_ANNUAL_STAGES, routeLeave } from "../lib/hr-workflow"

describe("regional non-annual leave workflow", () => {
  it("submits through Regional HR adjustment then Regional Manager approval without HOD or HR Executive stages", () => {
    const route = routeLeave({
      leaveType: "sick",
      locationName: "Kumasi Regional Office",
      hasRegionalOffice: true,
    })

    expect(route).toEqual({
      route: "regional_non_annual",
      firstStage: REGIONAL_NON_ANNUAL_STAGES.regionalHrReview,
    })

    const stages = [
      REGIONAL_NON_ANNUAL_STAGES.regionalHrReview,
      REGIONAL_NON_ANNUAL_STAGES.regionalManagerApproval,
      REGIONAL_NON_ANNUAL_STAGES.hrRecordsReference,
    ]
    expect(stages).not.toContain("pending_hod_review")
    expect(stages).not.toContain("pending_hr_executive_approval")
    expect(stages[0]).toBe("pending_regional_hr_review")
    expect(stages[1]).toBe("pending_regional_manager_approval")
  })
})
