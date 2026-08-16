import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

describe("loan request schema contract", () => {
  const route = readFileSync(join(process.cwd(), "app/api/loan/request/route.ts"), "utf8")

  it("uses the live loan type key for duplicate checks", () => {
    expect(route).toContain('.select("id, status, request_number, loan_type_label, loan_type_key")')
    expect(route).toContain('.eq("loan_type_key", loanType)')
    expect(route).not.toContain('.eq("loan_type", loanType)')
  })

  it("does not insert assignment columns absent from loan_requests", () => {
    const payloadBlock = route.slice(route.indexOf("const payload = {"), route.indexOf("let { data: inserted"))
    for (const unsupportedColumn of ["assigned_location_id", "region_id", "hod_id", "regional_hr_id", "regional_manager_id"]) {
      expect(payloadBlock).not.toContain(`${unsupportedColumn}:`)
    }
    expect(payloadBlock).toContain("...locationSnapshot")
    expect(payloadBlock).toContain("hod_reviewer_id:")
  })
})
