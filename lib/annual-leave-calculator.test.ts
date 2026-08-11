import { describe, expect, it } from "vitest"
import { buildMemoRemarks } from "./professional-memo-generator"
import { buildAnnualLeaveDisplay, calculateAnnualLeaveBreakdown, getNextWorkingDay } from "./annual-leave-calculator"

describe("annual leave calculation", () => {
  it("uses the approved end date when calculating resumption", () => {
    expect(getNextWorkingDay("2026-09-17").toISOString().slice(0, 10)).toBe("2026-09-18")
  })

  it("moves weekend leave endings to the next working day", () => {
    expect(getNextWorkingDay("2026-09-19").toISOString().slice(0, 10)).toBe("2026-09-21")
  })

  it("calculates 36 entitlement with no enjoyed days and two travel days", () => {
    const result = calculateAnnualLeaveBreakdown({ staff_category: "senior" }, 0)
    expect(result.annualEntitlement).toBe(36)
    expect(result.annualDaysRemaining).toBe(36)
    expect(result.totalGrantedDays).toBe(38)
  })

  it("does not repeat calculated reasons already present in the saved reason", () => {
    const remarks = buildMemoRemarks({
      savedReason: "4 day(s) already enjoyed; 2 travelling day(s) added",
      calculatedRemarks: ["4 day(s) already enjoyed", "2 travelling day(s) added"],
    })
    expect(remarks).toBe("4 day(s) already enjoyed; 2 travelling day(s) added")
  })

  it("keeps a custom reason and adds only missing calculated details", () => {
    const remarks = buildMemoRemarks({
      savedReason: "Adjusted after HR review",
      calculatedRemarks: ["4 day(s) already enjoyed", "2 travelling day(s) added"],
    })
    expect(remarks).toBe("Adjusted after HR review; 4 day(s) already enjoyed; 2 travelling day(s) added")
  })

  it("treats given days as already enjoyed deductions", () => {
    const result = calculateAnnualLeaveBreakdown({ staff_category: "senior" }, 4)
    expect(result.annualDaysRemaining).toBe(32)
    expect(result.totalGrantedDays).toBe(34)
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

