import { describe, expect, it } from "vitest"
import {
  canEditFleetInventory,
  canManageTransport,
  canViewFleetInventory,
  canCreateTransportRequest,
  isChiefDriverRole,
} from "../lib/role-capabilities"

describe("Chief Driver transport permissions", () => {
  it("allows a Chief Driver to manage local transport and fleet condition", () => {
    expect(isChiefDriverRole("chief driver")).toBe(true)
    expect(canManageTransport("chief_driver")).toBe(true)
    expect(canEditFleetInventory("chief_driver")).toBe(true)
    expect(canViewFleetInventory("chief_driver")).toBe(true)
  })

  it("does not give a Chief Driver nationwide fleet scope", async () => {
    const { hasNationwideFleetScope } = await import("../lib/role-capabilities")
    expect(hasNationwideFleetScope("chief_driver")).toBe(false)
  })

  it("allows Regional HR and Chief Driver to create regional transport requests for RM endorsement", () => {
    expect(canCreateTransportRequest("regional_hr")).toBe(true)
    expect(canCreateTransportRequest("chief_driver")).toBe(true)
    expect(canCreateTransportRequest("department_head")).toBe(true)
    expect(canCreateTransportRequest("regional_manager")).toBe(false)
    expect(canCreateTransportRequest("hr_executive")).toBe(false)
  })
})