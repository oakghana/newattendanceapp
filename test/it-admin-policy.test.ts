import { describe, expect, it } from "vitest"
import { canItAdminCreateRole, canUpdateStaffByITAdmin, normalizeItAdminScope } from "../lib/it-admin-policy"

const noQueryClient = { from: () => ({}) }

describe("IT Admin staff-management policy", () => {
  it("normalizes explicit regional and head-office scopes", () => {
    expect(normalizeItAdminScope("Regional IT Admin")).toBe("regional_it_admin")
    expect(normalizeItAdminScope("head-office-it-admin")).toBe("head_office_it_admin")
    expect(normalizeItAdminScope("QCC Head Office")).toBeNull()
  })

  it.each(["staff", "contract", "intern", "nsp", "regional_manager", "driver", "chief_driver"])(
    "allows IT Admin creation/filtering for %s",
    (role) => expect(canItAdminCreateRole(role)).toBe(true),
  )

  it.each(["admin", "department_head", "accounts", "hr_leave_office", "it-admin", "secretary"])(
    "hides administrator-only role %s from IT Admin creation/filtering",
    (role) => expect(canItAdminCreateRole(role)).toBe(false),
  )

  it("gives Head Office IT Admin organization-wide access to unrestricted profiles", async () => {
    await expect(
      canUpdateStaffByITAdmin(noQueryClient, { role: "it-admin", it_admin_scope: "head_office_it_admin" }, { role: "staff" }),
    ).resolves.toMatchObject({ allowed: true, scope: "head_office_it_admin" })
  })

  it("blocks restricted profiles even for Head Office IT Admin", async () => {
    await expect(
      canUpdateStaffByITAdmin(noQueryClient, { role: "it-admin", it_admin_scope: "head_office_it_admin" }, { role: "staff", it_admin_update_restricted: true }),
    ).resolves.toMatchObject({ allowed: false })
  })

  it("allows a regional IT Admin to update their own unrestricted profile when scoped", async () => {
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { id: "ashanti", location_type: "region" }, error: null }),
          }),
        }),
      }),
    }
    await expect(
      canUpdateStaffByITAdmin(
        client,
        { role: "it-admin", it_admin_scope: "regional_it_admin", assigned_location_id: "ashanti", region_id: "ashanti" },
        { id: "self", role: "it-admin", assigned_location_id: "ashanti" },
        "ashanti",
      ),
    ).resolves.toMatchObject({ allowed: true, scope: "regional_it_admin" })
  })

  it("blocks legacy or unscoped IT Admins before any location-based authorization", async () => {
    await expect(
      canUpdateStaffByITAdmin(noQueryClient, { role: "it-admin" }, { role: "staff" }),
    ).resolves.toMatchObject({ allowed: false })
  })
})
