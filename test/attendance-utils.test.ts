import { describe, it, expect } from "vitest"
import {
  isWeekend,
  isSecurityDept,
  requiresLatenessReason,
  requiresEarlyCheckoutReason,
  canAutoCheckoutOutOfRange,
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

  it("enforces lateness reason only on weekdays and non-security", () => {
    const weekday = new Date("2026-02-12T10:30:00Z") // Thursday
    const saturday = new Date("2026-02-14T10:30:00Z")

    expect(requiresLatenessReason(weekday, { code: "HR" })).toBe(true)
    expect(requiresLatenessReason(saturday, { code: "HR" })).toBe(false)
    expect(requiresLatenessReason(weekday, { code: "security" })).toBe(true)
  })

  it("does not bypass lateness or early-checkout reasons for privileged roles", () => {
    const weekday = new Date("2026-02-12T10:30:00Z")

    expect(requiresLatenessReason(weekday, { code: "HR" }, "admin")).toBe(true)
    expect(requiresLatenessReason(weekday, { code: "HR" }, "regional_manager")).toBe(true)
    expect(requiresLatenessReason(weekday, { code: "HR" }, "department_head")).toBe(true)

    expect(requiresEarlyCheckoutReason(weekday, true, "admin", { code: "HR" })).toBe(true)
    expect(requiresEarlyCheckoutReason(weekday, true, "regional_manager", { code: "HR" })).toBe(true)
    expect(requiresEarlyCheckoutReason(weekday, true, "department_head", { code: "HR" })).toBe(true)
  })

  it("enforces early-checkout reason only when location requires it and not on weekends", () => {
    const weekday = new Date("2026-02-12T15:00:00Z")
    const saturday = new Date("2026-02-14T15:00:00Z")

    expect(requiresEarlyCheckoutReason(weekday, true)).toBe(true)
    expect(requiresEarlyCheckoutReason(weekday, false)).toBe(false)
    expect(requiresEarlyCheckoutReason(saturday, true)).toBe(false)
  })

  it("does not bypass lateness or early-checkout reason for operational category", () => {
    const weekday = new Date("2026-02-12T10:30:00Z")

    expect(requiresLatenessReason(weekday, { code: "operational" })).toBe(true)
    expect(requiresEarlyCheckoutReason(weekday, true, undefined, { code: "operational" })).toBe(true)
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
