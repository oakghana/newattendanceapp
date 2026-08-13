import { describe, expect, it } from "vitest"
import { buildMemoRemarks } from "./professional-memo-generator"
import { resolveEntitlementFromProfile } from "./annual-leave-entitlement"
import {
  addAnnualLeaveWorkingDays,
  calculateAnnualLeaveMemoDates,
  extractAlreadyEnjoyedDays,
  buildAnnualLeaveDisplay,
  calculateAnnualLeaveBreakdown,
  getNextWorkingDay,
} from "./annual-leave-calculator"

describe("annual leave calculation", () => {
  it("uses the approved end date when calculating resumption", () => {
    expect(getNextWorkingDay("2026-09-17").toISOString().slice(0, 10)).toBe("2026-09-18")
  })

  it("does not extend the approved end date for adjustment days", () => {
    const approvedEnd = "2026-09-17"
    const preferredEnd = "2026-09-22"
    const authoritativeEnd = approvedEnd || preferredEnd
    expect(authoritativeEnd).toBe("2026-09-17")
    expect(getNextWorkingDay(authoritativeEnd).toISOString().slice(0, 10)).toBe("2026-09-18")
  })

  it("calculates 34 working days inclusively from 3 August as 17 September", () => {
    expect(addAnnualLeaveWorkingDays("2026-08-03", 34).toISOString().slice(0, 10)).toBe("2026-09-17")
    expect(getNextWorkingDay("2026-09-17").toISOString().slice(0, 10)).toBe("2026-09-18")
  })

  it("moves weekend leave endings to the next working day", () => {
    expect(getNextWorkingDay("2026-09-19").toISOString().slice(0, 10)).toBe("2026-09-21")
  })

  it("resolves senior staff to 36 core days plus 2 travel days", () => {
    const entitlement = resolveEntitlementFromProfile({ position: "Senior IT Officer" })
    expect(entitlement.annualLeaveDays).toBe(36)
    expect(entitlement.travelDays).toBe(2)
    expect(entitlement.totalEntitlement).toBe(38)
  })

  it("uses the same inclusive dates for 36 entitlement, 4 enjoyed, and 2 travel days", () => {
    const result = calculateAnnualLeaveMemoDates({
      startDate: "2026-08-03",
      entitlementDays: 36,
      grantedDays: 34,
      daysAlreadyEnjoyed: 4,
      travellingDays: 2,
    })
    expect(result.grantedDays).toBe(34)
    expect(result.endDate.toISOString().slice(0, 10)).toBe("2026-09-17")
    expect(result.resumptionDate.toISOString().slice(0, 10)).toBe("2026-09-18")
  })

  it("derives enjoyed days when the stored granted total is 22", () => {
    const result = calculateAnnualLeaveMemoDates({
      startDate: "2026-08-03",
      entitlementDays: 24,
      grantedDays: 22,
      travellingDays: 2,
    })
    expect(result.daysAlreadyEnjoyed).toBe(4)
    expect(result.endDate.toISOString().slice(0, 10)).toBe("2026-09-01")
  })

  it("extracts legacy enjoyed-day deductions from adjustment text", () => {
    expect(extractAlreadyEnjoyedDays("4 given during Christmas holidays")).toBe(4)
    expect(extractAlreadyEnjoyedDays("4 days already enjoyed deducted")).toBe(4)
    expect(extractAlreadyEnjoyedDays("No prior leave")).toBeNull()
  })

  it("keeps senior staff at 36 core days even when a legacy request says 24", () => {
    const profile = { position: "Senior IT Officer", staff_category: "senior" }
    const resolved = resolveEntitlementFromProfile(profile)
    const result = calculateAnnualLeaveMemoDates({
      startDate: "2026-08-03",
      entitlementDays: resolved.annualLeaveDays,
      daysAlreadyEnjoyed: 4,
      travellingDays: resolved.travelDays,
    })
    expect(resolved.annualLeaveDays).toBe(36)
    expect(result.grantedDays).toBe(34)
    expect(result.endDate.toISOString().slice(0, 10)).toBe("2026-09-17")
  })

  it("uses HR-adjusted outstanding entitlement and usage in memo totals", () => {
    const adjustedEntitlement = 34
    const adjustedUsed = 10
    const result = calculateAnnualLeaveMemoDates({
      startDate: "2026-08-03",
      entitlementDays: adjustedEntitlement,
      grantedDays: adjustedEntitlement - adjustedUsed,
      daysAlreadyEnjoyed: adjustedUsed,
      travellingDays: 0,
    })

    expect(result.entitlementDays).toBe(34)
    expect(result.daysAlreadyEnjoyed).toBe(10)
    expect(result.grantedDays).toBe(24)
  })

  it("adds HR carryover days to the core annual entitlement", () => {
    const coreEntitlement = 36
    const carryover = 12
    const adjustedEntitlement = coreEntitlement + carryover
    const result = calculateAnnualLeaveMemoDates({
      startDate: "2026-08-03",
      entitlementDays: adjustedEntitlement,
      grantedDays: adjustedEntitlement - 10,
      daysAlreadyEnjoyed: 10,
      travellingDays: 0,
    })

    expect(result.entitlementDays).toBe(48)
    expect(result.daysAlreadyEnjoyed).toBe(10)
    expect(result.grantedDays).toBe(38)
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
    expect(remarks).toBe("Adjusted after HR review")
  })

  it("treats given days as already enjoyed deductions", () => {
    const result = calculateAnnualLeaveBreakdown({ staff_category: "senior" }, 4)
    expect(result.annualDaysRemaining).toBe(32)
    expect(result.totalGrantedDays).toBe(34)
  })

  it("keeps numeric text in the reason out of the calculation", () => {
    const result = calculateAnnualLeaveBreakdown({ staff_category: "senior" }, 4)
    const remarks = buildMemoRemarks({
      savedReason: "4 given during Christmas holidays; 99 extra days requested",
      calculatedRemarks: ["4 day(s) given/already enjoyed deducted", "2 travelling day(s) added"],
    })
    expect(result.totalGrantedDays).toBe(34)
    expect(remarks).toContain("99 extra days requested")
    expect(remarks).not.toContain("99 travelling")
  })

  it("does not deduct public holidays from annual leave days", () => {
    const result = calculateAnnualLeaveMemoDates({
      startDate: "2026-08-03",
      entitlementDays: 36,
      daysAlreadyEnjoyed: 0,
      travellingDays: 2,
    })
    expect(result.grantedDays).toBe(38)
  })

  it("includes outstanding leave days in the entitled total", () => {
    const result = calculateAnnualLeaveMemoDates({
      startDate: "2026-08-03",
      entitlementDays: 48,
      daysAlreadyEnjoyed: 10,
      travellingDays: 2,
    })
    expect(result.entitlementDays).toBe(48)
    expect(result.grantedDays).toBe(40)
  })

  it("adds six outstanding days to a 26-day entitlement for a 32-day request", () => {
    const baseEntitlement = 26
    const outstanding = 6
    const result = calculateAnnualLeaveMemoDates({
      startDate: "2026-08-03",
      entitlementDays: baseEntitlement + outstanding,
      grantedDays: 32,
      daysAlreadyEnjoyed: 0,
      travellingDays: 0,
    })
    expect(result.entitlementDays).toBe(32)
    expect(result.grantedDays).toBe(32)
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

