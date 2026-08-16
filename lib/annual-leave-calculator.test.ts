import { describe, expect, it } from "vitest"
import { buildMemoRemarks } from "./professional-memo-generator"
import { resolveEntitlementFromProfile } from "./annual-leave-entitlement"
import {
  addAnnualLeaveWorkingDays,
  calculateAnnualLeaveMemoDates,
  calculateAnnualLeaveMemoBreakdown,
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
    expect(getNextWorkingDay("2026-09-20").toISOString().slice(0, 10)).toBe("2026-09-21")
  })

  it("resolves senior staff to 36 core days plus 2 travel days", () => {
    const entitlement = resolveEntitlementFromProfile({ position: "Senior IT Officer" })
    expect(entitlement.annualLeaveDays).toBe(36)
    expect(entitlement.travelDays).toBe(2)
    expect(entitlement.totalEntitlement).toBe(38)
  })

  it("calculates the approved inclusive period and next working-day resumption", () => {
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

  it("uses the agreed 36 minus 1 plus 4 plus 2 annual breakdown", () => {
    const breakdown = calculateAnnualLeaveMemoBreakdown({
      baseEntitlementDays: 36,
      daysAlreadyEnjoyed: 1,
      outstandingDays: 4,
      travellingDays: 2,
    })
    expect(breakdown.baseEntitlementDays).toBe(35)
    expect(breakdown.outstandingDays).toBe(4)
    expect(breakdown.travellingDays).toBe(2)
    expect(breakdown.grantedDays).toBe(41)

    const dates = calculateAnnualLeaveMemoDates({
      startDate: "2026-08-03",
      entitlementDays: 39,
      grantedDays: breakdown.grantedDays,
      daysAlreadyEnjoyed: 0,
      travellingDays: breakdown.travellingDays,
    })
    expect(dates.endDate.toISOString().slice(0, 10)).toBe("2026-09-28")
    expect(dates.resumptionDate.toISOString().slice(0, 10)).toBe("2026-09-29")
  })

  it("reproduces the manually-verified 36/4/0/2 memo end-to-end (download-memo route logic)", () => {
    // Mirrors the exact field precedence used in app/api/leave/download-memo/route.ts
    // for a staff member with no outstanding days — matches the signed paper memo
    // (36 base, 4 already enjoyed, 2 travel days => 34 granted, 3 Aug -> 17 Sep, resume 18 Sep).
    const req = {
      preferred_start_date: "2026-08-03",
      leave_type_key: "annual",
      prior_leave_days_deducted: 4,
      holiday_days_deducted: null,
      outstanding_leave_days_added: 0,
      travelling_days_added: 2,
    } as any
    const resolvedEntitlement = { annualLeaveDays: 36, travelDays: 2 }
    const outstandingDays = Math.max(0, Number(req.outstanding_leave_days_added ?? req.outstanding_leave_days ?? 0))
    const travelDays = resolvedEntitlement.travelDays ?? Number(req.travelling_days_added || 2)
    const breakdown = calculateAnnualLeaveMemoBreakdown({
      baseEntitlementDays: resolvedEntitlement.annualLeaveDays,
      daysAlreadyEnjoyed: Number(req.prior_leave_days_deducted || 0) + Number(req.holiday_days_deducted || 0),
      outstandingDays,
      travellingDays: travelDays || 2,
    })
    const entitlementDays = breakdown.baseEntitlementDays + breakdown.outstandingDays
    const annualDates = calculateAnnualLeaveMemoDates({
      startDate: req.preferred_start_date,
      entitlementDays,
      grantedDays: breakdown.grantedDays,
      daysAlreadyEnjoyed: 0,
      travellingDays: breakdown.travellingDays,
    })
    expect(breakdown.grantedDays).toBe(34)
    expect(annualDates.endDate.toISOString().slice(0, 10)).toBe("2026-09-17")
    expect(annualDates.resumptionDate.toISOString().slice(0, 10)).toBe("2026-09-18")
  })

  it("calculates manager entitlement with outstanding and travel days", () => {
    const result = calculateAnnualLeaveMemoDates({
      startDate: "2026-08-03",
      entitlementDays: 36 + 4,
      grantedDays: 41,
      daysAlreadyEnjoyed: 1,
      travellingDays: 2,
    })
    expect(result.entitlementDays).toBe(40)
    expect(result.daysAlreadyEnjoyed).toBe(1)
    expect(result.grantedDays).toBe(41)
    expect(36 - result.daysAlreadyEnjoyed + 4 + 2).toBe(41)
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
    expect(remarks).toBe("Adjusted after HR review; 4 day(s) already enjoyed; 2 travelling day(s) added")
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

