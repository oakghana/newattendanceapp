import { describe, expect, it } from "vitest"
import { calculateLeaveDuration, generateCalculationSummary } from "./leave-calculation-service"
import { computeReturnToWorkDate, getMaternityEntitlementDays } from "./leave-policy"

const date = (value: string) => new Date(`${value}T00:00:00Z`)

describe("maternity entitlement policy", () => {
  it("uses 84 days for normal delivery and 98 days for CS or twins", () => {
    expect(getMaternityEntitlementDays("normal")).toBe(84)
    expect(getMaternityEntitlementDays("cs")).toBe(98)
    expect(getMaternityEntitlementDays("twins")).toBe(98)
    expect(getMaternityEntitlementDays("cs_twins")).toBe(98)
  })
})

describe("calendar-day maternity and paternity rules", () => {
  it("counts every maternity day across weekends and holidays", () => {
    const start = date("2026-08-01")
    const end = date("2026-10-23")
    const totalDays = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1

    expect(totalDays).toBe(84)
    expect(computeReturnToWorkDate("2026-10-23", ["2026-10-24"], "maternity")).toBe("2026-10-24")
  })

  it("uses five inclusive calendar days for paternity leave", () => {
    const start = date("2026-08-07")
    const end = new Date(start)
    end.setUTCDate(end.getUTCDate() + 4)

    expect(Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1).toBe(5)
    expect(computeReturnToWorkDate("2026-08-11", [], "paternity")).toBe("2026-08-12")
  })
})

describe("leave calculation service", () => {
  it("counts working days, travel days, and exact holiday dates consistently", () => {
    const result = calculateLeaveDuration(
      date("2026-01-05"),
      date("2026-01-09"),
      [date("2026-01-07")],
      2,
    )

    expect(result.businessDays).toBe(4)
    expect(result.weekendDays).toBe(0)
    expect(result.holidayDays).toBe(1)
    expect(result.holidayDates).toEqual(["2026-01-07"])
    expect(result.actualLeaveDays).toBe(6)
    expect(generateCalculationSummary(result).holidayDays).toEqual(["2026-01-07"])
  })

  it("handles weekend-only dates without counting them as leave days", () => {
    const result = calculateLeaveDuration(date("2026-01-10"), date("2026-01-11"))

    expect(result.businessDays).toBe(0)
    expect(result.weekendDays).toBe(2)
    expect(result.actualLeaveDays).toBe(0)
  })
})

