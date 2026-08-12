import { describe, it, expect } from "vitest"
import {
  computeAnnualLeaveEntitlement,
  resolveEntitlementFromProfile,
  deriveStaffCategoryFromPosition,
} from "./annual-leave-entitlement"

describe("computeAnnualLeaveEntitlement", () => {
  it("gives Senior staff a flat 36 days (+2 travel = 38 total)", () => {
    const e = computeAnnualLeaveEntitlement("senior", 0)
    expect(e.annualLeaveDays).toBe(36)
    expect(e.totalEntitlement).toBe(38)
  })

  it("gives Managers a flat 36 days (+2 travel = 38 total), regardless of years of service", () => {
    const shortService = computeAnnualLeaveEntitlement("manager", 1)
    const longService = computeAnnualLeaveEntitlement("manager", 20)
    expect(shortService.annualLeaveDays).toBe(36)
    expect(shortService.totalEntitlement).toBe(38)
    expect(longService.annualLeaveDays).toBe(36)
    expect(longService.totalEntitlement).toBe(38)
  })

  it("tiers Junior staff by years of service: 1-3y = 24 days", () => {
    expect(computeAnnualLeaveEntitlement("junior", 1).annualLeaveDays).toBe(24)
    expect(computeAnnualLeaveEntitlement("junior", 3).annualLeaveDays).toBe(24)
  })

  it("tiers Junior staff by years of service: 4-5y = 28 days", () => {
    expect(computeAnnualLeaveEntitlement("junior", 4).annualLeaveDays).toBe(28)
    expect(computeAnnualLeaveEntitlement("junior", 5).annualLeaveDays).toBe(28)
  })

  it("tiers Junior staff by years of service: 6-10y = 32 days", () => {
    expect(computeAnnualLeaveEntitlement("junior", 6).annualLeaveDays).toBe(32)
    expect(computeAnnualLeaveEntitlement("junior", 10).annualLeaveDays).toBe(32)
  })

  it("tiers Junior staff by years of service: 11y+ = 36 days", () => {
    expect(computeAnnualLeaveEntitlement("junior", 11).annualLeaveDays).toBe(36)
    expect(computeAnnualLeaveEntitlement("junior", 27).annualLeaveDays).toBe(36)
  })

  it("always adds 2 travel days on top of the core entitlement", () => {
    expect(computeAnnualLeaveEntitlement("junior", 1).totalEntitlement).toBe(26)
    expect(computeAnnualLeaveEntitlement("junior", 4).totalEntitlement).toBe(30)
    expect(computeAnnualLeaveEntitlement("junior", 6).totalEntitlement).toBe(34)
    expect(computeAnnualLeaveEntitlement("junior", 11).totalEntitlement).toBe(38)
  })
})

describe("resolveEntitlementFromProfile", () => {
  it("treats stored category 'officer' as Senior-tier (36 flat)", () => {
    const e = resolveEntitlementFromProfile({
      staff_category: "officer",
      years_of_service: 27,
    })
    expect(e.staffCategory).toBe("senior")
    expect(e.annualLeaveDays).toBe(36)
    expect(e.totalEntitlement).toBe(38)
  })

  it("treats stored category 'manager' as flat 36, ignoring years of service", () => {
    const e = resolveEntitlementFromProfile({
      staff_category: "manager",
      years_of_service: 2,
    })
    expect(e.staffCategory).toBe("manager")
    expect(e.annualLeaveDays).toBe(36)
  })

  it("gives a junior staff member 36 days after 11 years", () => {
    const e = resolveEntitlementFromProfile({
      staff_category: "junior",
      date_of_appointment: "2015-01-01",
    }, new Date("2026-08-12"))
    expect(e.yearsOfService).toBe(11)
    expect(e.annualLeaveDays).toBe(36)
    expect(e.totalEntitlement).toBe(38)
  })

  it("tiers explicit 'junior' category by years of service", () => {
    const e = resolveEntitlementFromProfile({
      staff_category: "junior",
      years_of_service: 6,
    })
    expect(e.staffCategory).toBe("junior")
    expect(e.annualLeaveDays).toBe(32)
  })

  it("derives category from position when staff_category is empty", () => {
    const e = resolveEntitlementFromProfile({
      staff_category: "",
      position: "SNR.INFOR. SYSTEMS OFFICER",
      years_of_service: 27,
    })
    expect(e.staffCategory).toBe("senior")
    expect(e.annualLeaveDays).toBe(36)
  })

  it("falls back to position-derived category for an unrecognized stored value instead of forcing junior", () => {
    const e = resolveEntitlementFromProfile({
      staff_category: "some-unmapped-value",
      position: "REGIONAL MANAGER",
      years_of_service: 5,
    })
    expect(e.staffCategory).toBe("manager")
    expect(e.annualLeaveDays).toBe(36)
  })

  it("computes years of service from date_of_appointment when not explicitly stored", () => {
    const tenYearsAgo = new Date()
    tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 7)
    const e = resolveEntitlementFromProfile({
      staff_category: "junior",
      date_of_appointment: tenYearsAgo.toISOString(),
    })
    expect(e.yearsOfService).toBe(7)
    expect(e.annualLeaveDays).toBe(32)
  })
})

describe("deriveStaffCategoryFromPosition", () => {
  it("maps 'officer' positions (not starting with Assistant) to senior", () => {
    expect(deriveStaffCategoryFromPosition("Snr. Infor. Systems Officer")).toBe("senior")
  })

  it("maps 'manager' positions to manager", () => {
    expect(deriveStaffCategoryFromPosition("Regional Manager")).toBe("manager")
  })

  it("maps 'assistant officer' positions to junior", () => {
    expect(deriveStaffCategoryFromPosition("Assistant Officer")).toBe("junior")
  })
})
