import { describe, expect, it } from "vitest"
import { resolveEffectiveLeaveEndDate } from "../lib/resumption-confirmation-helpers"

describe("resumption effective end date", () => {
  it("uses adjusted_end_date before preferred_end_date", () => {
    expect(resolveEffectiveLeaveEndDate({ adjusted_end_date: "2026-10-05", preferred_end_date: "2026-09-30" })).toBe("2026-10-05")
  })

  it("falls back to preferred_end_date when adjusted date is missing", () => {
    expect(resolveEffectiveLeaveEndDate({ adjusted_end_date: null, preferred_end_date: "2026-09-30" })).toBe("2026-09-30")
  })

  it("normalizes timestamp values to date-only strings", () => {
    expect(resolveEffectiveLeaveEndDate({ adjusted_end_date: "2026-10-05T12:30:00Z", preferred_end_date: "2026-09-30" })).toBe("2026-10-05")
  })
})