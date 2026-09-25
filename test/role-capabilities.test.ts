import { describe, expect, it } from "vitest"
import {
  canAccessDisbursementConfirmation,
  canManageOwnSignature,
  canEditDriverLicenses,
  canEditFleetInventory,
  canManageTransport,
  canViewFleetInventory,
  canCreateTransportRequest,
  hasNationwideFleetScope,
  isChiefDriverRole,
  isActingHod,
  isAssignedHod,
  isDualTransportHod,
  isTransportDepartmentHod,
} from "../lib/role-capabilities"

  describe("Signature access", () => {
    it.each(["department_head", "hod", "accounts_executive"])("allows %s to manage a signature", (role) => {
      expect(canManageOwnSignature(role)).toBe(true)
    })
  })

  describe("Disbursement confirmation access", () => {
  it.each(["admin", "administrator", "super_admin", "god", "accounts", "accounts_executive", "hr_executive", "loan_office", "hr_loan_office", "accounts_loan_office"])("allows %s", (role) => {
    expect(canAccessDisbursementConfirmation(role)).toBe(true)
  })

  it.each(["staff", "secretary", "hr_records", "regional_hr", null, undefined])("denies %s", (role) => {
    expect(canAccessDisbursementConfirmation(role)).toBe(false)
  })
})

describe("Chief Driver transport permissions", () => {
  it("allows a Chief Driver to manage local transport with read-only fleet access", () => {
    expect(isChiefDriverRole("chief driver")).toBe(true)
    expect(canManageTransport("chief_driver")).toBe(true)
    expect(canEditFleetInventory("chief_driver")).toBe(false)
    expect(canViewFleetInventory("chief_driver")).toBe(true)
    expect(canEditDriverLicenses("chief_driver")).toBe(false)
    expect(isChiefDriverRole("regional_chief_driver")).toBe(true)
    expect(isChiefDriverRole("regional_chief_driver")).toBe(true)
  })

  it("does not give a Chief Driver nationwide fleet scope", async () => {
    expect(hasNationwideFleetScope("chief_driver")).toBe(false)
  })

  it("allows IT Admin to manage driver license reminders nationwide", () => {
    expect(canManageTransport("it-admin")).toBe(true)
    expect(canEditDriverLicenses("it-admin")).toBe(true)
    expect(hasNationwideFleetScope("it-admin")).toBe(true)
  })

  it("allows Regional HR and Chief Driver to create regional transport requests for RM endorsement", () => {
    expect(canCreateTransportRequest("regional_hr")).toBe(true)
    expect(canCreateTransportRequest("chief_driver")).toBe(true)
    expect(canCreateTransportRequest("department_head")).toBe(true)
    expect(canCreateTransportRequest("regional_manager")).toBe(false)
    expect(canCreateTransportRequest("hr_executive")).toBe(false)
  })
})

describe("Assigned HOD dual-role permissions", () => {
  it("treats linkage as HOD regardless of transport_manager role", () => {
    expect(isAssignedHod(true)).toBe(true)
    expect(isActingHod("transport_manager", true)).toBe(true)
    expect(isActingHod("transport_manager", false)).toBe(true)
    expect(isActingHod("department_head", false)).toBe(true)
  })

  it("identifies a Transport department assigned HOD and dual TM+HOD identity", () => {
    const transportDept = { code: "transport", name: "Transport Department" }
    expect(isTransportDepartmentHod("transport_manager", transportDept, true)).toBe(true)
    expect(isTransportDepartmentHod("staff", transportDept, false)).toBe(false)
    expect(isDualTransportHod("transport_manager", transportDept, true)).toBe(true)
    expect(isDualTransportHod("department_head", transportDept, false)).toBe(true)
    expect(isDualTransportHod("staff", { code: "hr", name: "Human Resources" }, true)).toBe(false)
  })

  it("lets an assigned HOD create non-regional transport requests", () => {
    expect(canCreateTransportRequest("transport_manager")).toBe(false)
    expect(canCreateTransportRequest("transport_manager", true)).toBe(true)
    expect(canCreateTransportRequest("staff", true)).toBe(true)
  })
})
