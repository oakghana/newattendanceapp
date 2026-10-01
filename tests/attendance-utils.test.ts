import { describe, expect, it } from "vitest"
import { isExemptFromLatenessReason, requiresLatenessReason } from "../lib/attendance-utils"

describe("lateness reason policy", () => {
  const lateMorning = new Date(2026, 0, 5, 9, 30)

  it("requires a reason for every non-exempt role and department", () => {
    expect(isExemptFromLatenessReason({ name: "Transport" }, "staff")).toBe(false)
    expect(isExemptFromLatenessReason({ name: "Security" }, "security_officer")).toBe(false)
    expect(requiresLatenessReason(lateMorning, { name: "Transport" }, "staff")).toBe(true)
  })

  it("exempts only the Managing Director, HOD, and Regional Manager roles", () => {
    for (const role of ["managing_director", "department_head", "head_of_department", "regional_manager"]) {
      expect(isExemptFromLatenessReason({ name: "Transport" }, role)).toBe(true)
      expect(requiresLatenessReason(lateMorning, { name: "Transport" }, role)).toBe(false)
    }
  })
})
