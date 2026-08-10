import { describe, expect, it } from "vitest"
import { calculateLeaveDuration, generateCalculationSummary } from "./leave-calculation-service"

const date = (value: string) => new Date(`${value}T00:00:00Z`)

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

