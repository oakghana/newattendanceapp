import { describe, expect, it } from "vitest"
import { buildAnnualLeaveDisplay, calculateAnnualLeaveBreakdown } from "./annual-leave-calculator"

describe("annual leave calculation", () => {
  it("calculates 36 entitlement with no enjoyed days and two travel days", () => {
    const result = calculateAnnualLeaveBreakdown({ staff_category: "senior" }, 0)
    expect(result.annualEntitlement).toBe(36)
    expect(result.annualDaysRemaining).toBe(36)
    expect(result.totalGrantedDays).toBe(38)
  })

  it("calculates 36 - 4 + 2 = 34", () => {
    const result = calculateAnnualLeaveBreakdown({ staff_category: "senior" }, 4)
    const display = buildAnnualLeaveDisplay(result)
    expect(result.annualDaysRemaining).toBe(32)
    expect(result.totalGrantedDays).toBe(34)
    expect(display.entitled).toBe("36 plus 2 travelling days")
    expect(display.granted).toBe("34 (32 annual leave days plus 2 travelling days)")
    expect(display.remarks).toContain("4 day(s) already enjoyed")
    expect(display.remarks).toContain("2 travelling days added")
  })
})

