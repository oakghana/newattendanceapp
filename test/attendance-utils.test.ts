import { describe, it, expect } from "vitest"
import {
  isWeekend,
  isSecurityDept,
  requiresLatenessReason,
  requiresEarlyCheckoutReason,
  canAutoCheckoutOutOfRange,
  canCheckInAtTime,
} from "../lib/attendance-utils"

describe("attendance-utils", () => {
  it("correctly identifies weekends", () => {
    // 2026-02-14 is Saturday? (use known dates)
    const fri = new Date("2026-02-13T10:00:00Z") // Friday
    const sat = new Date("2026-02-14T10:00:00Z") // Saturday
    const sun = new Date("2026-02-15T10:00:00Z") // Sunday

    expect(isWeekend(fri)).toBe(false)
    expect(isWeekend(sat)).toBe(true)
    expect(isWeekend(sun)).toBe(true)
  })

  it("detects Security department values", () => {
    expect(isSecurityDept({ code: "SECURITY" })).toBe(true)
    expect(isSecurityDept({ name: "Security Operations" })).toBe(true)
    expect(isSecurityDept({ code: "HR" })).toBe(false)
  })

  it("enforces lateness reason only on weekdays and non-exempt staff", () => {
    const weekday = new Date("2026-02-12T10:30:00Z") // Thursday
    const saturday = new Date("2026-02-14T10:30:00Z")

    expect(requiresLatenessReason(new Date("2026-02-12T09:00:00"), { code: "HR" })).toBe(false)
    expect(requiresLatenessReason(new Date("2026-02-12T09:01:00"), { code: "HR" })).toBe(true)
    expect(requiresLatenessReason(saturday, { code: "HR" })).toBe(true)
    expect(requiresLatenessReason(weekday, { code: "security" })).toBe(true)
    expect(requiresLatenessReason(weekday, { code: "transport" })).toBe(true)
    expect(requiresLatenessReason(weekday, { code: "operations" })).toBe(true)
    expect(requiresLatenessReason(weekday, { code: "operations" }, "staff")).toBe(true)
    expect(requiresLatenessReason(weekday, { code: "operations" }, "department_head")).toBe(false)
  })

  it("exempts administrator roles from attendance reasons", () => {
    const weekday = new Date("2026-02-12T10:30:00Z")

    expect(requiresLatenessReason(weekday, { code: "HR" }, "administrator")).toBe(true)
    expect(requiresEarlyCheckoutReason(weekday, true, "administrator", { code: "HR" })).toBe(false)
    expect(requiresLatenessReason(weekday, { code: "HR" }, "admin")).toBe(true)
    expect(requiresEarlyCheckoutReason(weekday, true, "admin", { code: "HR" })).toBe(false)

    expect(requiresLatenessReason(weekday, { code: "HR" }, "managing_director")).toBe(false)
    expect(requiresLatenessReason(weekday, { code: "HR" }, "accounts_executive")).toBe(true)
    expect(requiresLatenessReason(weekday, { code: "HR" }, "hr_executive")).toBe(true)
    expect(requiresLatenessReason(weekday, { code: "HR" }, "regional_manager")).toBe(false)
    expect(requiresEarlyCheckoutReason(weekday, true, "department_head", { code: "HR" })).toBe(false)
  })

  it("enforces early-checkout reason only when location requires it and not on weekends", () => {
    const weekday = new Date("2026-02-12T15:00:00Z")
    const saturday = new Date("2026-02-14T15:00:00Z")

    expect(requiresEarlyCheckoutReason(weekday, true)).toBe(true)
    expect(requiresEarlyCheckoutReason(weekday, false)).toBe(false)
    expect(requiresEarlyCheckoutReason(saturday, true)).toBe(false)
  })

  it("allows standard departments to check in at any time", () => {
    const lateWeekday = new Date("2026-02-12T16:30:00")
    for (const code of ["it_audit", "research", "estate", "accounts", "legal", "monitoring_and_evaluation", "hr"]) {
      expect(canCheckInAtTime(lateWeekday, { code })).toBe(true)
    }
    for (const role of ["NSP", "contract", "contract_role"]) {
      expect(canCheckInAtTime(lateWeekday, undefined, role)).toBe(true)
    }
  })

  it("requires lateness reasons from operational staff but keeps shift checkout rules", () => {
    const weekday = new Date("2026-02-12T10:30:00Z")

    expect(requiresLatenessReason(weekday, { code: "operational" })).toBe(true)
    expect(requiresEarlyCheckoutReason(weekday, true, undefined, { code: "operational" })).toBe(false)
  })

  it("allows automatic out-of-range checkout from 4 PM only after 7 hours", () => {
    const eligibleTime = new Date("2026-02-12T16:05:00")

    expect(
      canAutoCheckoutOutOfRange({
        now: eligibleTime,
        hasCheckedIn: true,
        hasCheckedOut: false,
        isOutOfRange: true,
        isOnLeave: false,
        hoursWorked: 7.1,
      }),
    ).toBe(true)
  })

  it("allows automatic checkout handling for 22-hour departments", () => {
    const overnight = new Date("2026-02-12T23:59:00")

    for (const dept of [{ code: "security" }, { code: "transport" }, { code: "operations" }]) {
      expect(canAutoCheckoutOutOfRange({
        now: overnight,
        hasCheckedIn: true,
        hasCheckedOut: false,
        isOutOfRange: true,
        isOnLeave: false,
        hoursWorked: 8,
        dept,
      })).toBe(true)
    }
  })

  it("blocks automatic out-of-range checkout before 4 PM, before 7 hours, or after checkout", () => {
    const earlyTime = new Date("2026-02-12T15:59:00")

    expect(
      canAutoCheckoutOutOfRange({
        now: earlyTime,
        hasCheckedIn: true,
        hasCheckedOut: false,
        isOutOfRange: true,
        isOnLeave: false,
        hoursWorked: 8,
      }),
    ).toBe(false)

    expect(
      canAutoCheckoutOutOfRange({
        now: new Date("2026-02-12T16:10:00"),
        hasCheckedIn: true,
        hasCheckedOut: false,
        isOutOfRange: true,
        isOnLeave: false,
        hoursWorked: 6.9,
      }),
    ).toBe(false)

    expect(
      canAutoCheckoutOutOfRange({
        now: new Date("2026-02-12T16:10:00"),
        hasCheckedIn: true,
        hasCheckedOut: true,
        isOutOfRange: true,
        isOnLeave: false,
        hoursWorked: 8,
      }),
    ).toBe(false)
  })
})
