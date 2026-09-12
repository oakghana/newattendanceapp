import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  ownedLocations: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => mocks)
vi.mock("@/lib/role-capabilities", async () => import("../lib/role-capabilities"))
vi.mock("@/lib/regional-manager-scope", () => ({ resolveOwnedLocationIdsForRegionalOffice: mocks.ownedLocations }))
vi.mock("@/lib/excuse-duty-notifications", () => ({ notifyExcuseDutyHodDecision: vi.fn() }))

import { GET } from "../app/api/admin/excuse-duty/route"

function queryResult(data: unknown, error: unknown = null) {
  const query: Record<string, any> = {}
  for (const method of ["select", "eq", "in", "gte", "lte", "order", "range"]) {
    query[method] = vi.fn(() => query)
  }
  query.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data, error }).then(resolve)
  return query
}

function setup(role = "admin", departmentId: string | null = "department-1") {
  const session = {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "reviewer" } }, error: null }) },
    from: vi.fn(() => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { role, department_id: departmentId, assigned_location_id: "office-1" }, error: null }) }) }) })),
  }
  const documents = queryResult([])
  const profiles = queryResult([{ id: "staff-1" }])
  const admin = { from: vi.fn((table: string) => table === "excuse_documents" ? documents : profiles) }
  mocks.createClient.mockResolvedValue(session)
  mocks.createAdminClient.mockResolvedValue(admin)
  mocks.ownedLocations.mockResolvedValue(["office-1", "district-1"])
  return { session, admin, documents, profiles }
}

describe("Excuse duty document reads", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("authenticates before using the admin client and paginates document reads", async () => {
    const { session, documents } = setup()
    const response = await GET(new NextRequest("http://localhost/api/admin/excuse-duty?page=2&per_page=20"))
    expect(response.status).toBe(200)
    expect(session.from).toHaveBeenCalledTimes(1)
    expect(session.from).toHaveBeenCalledWith("user_profiles")
    expect(documents.range).toHaveBeenCalledWith(20, 40)
    expect(documents.order).toHaveBeenCalledWith("id", { ascending: false })
  })

  it("rejects staff before creating an elevated client", async () => {
    setup("staff")
    const response = await GET(new NextRequest("http://localhost/api/admin/excuse-duty"))
    expect(response.status).toBe(403)
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
  })

  it("returns no documents for a department head without a department", async () => {
    setup("department_head", null)
    const response = await GET(new NextRequest("http://localhost/api/admin/excuse-duty"))
    expect((await response.json()).excuseDocuments).toEqual([])
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
  })

  it("restricts department heads to their department staff", async () => {
    const { documents, profiles } = setup("department_head")
    await GET(new NextRequest("http://localhost/api/admin/excuse-duty"))
    expect(profiles.eq).toHaveBeenCalledWith("department_id", "department-1")
    expect(documents.in).toHaveBeenCalledWith("user_id", ["staff-1"])
  })

  it("restricts regional reviewers to owned offices and districts", async () => {
    const { documents, profiles } = setup("regional_manager")
    await GET(new NextRequest("http://localhost/api/admin/excuse-duty"))
    expect(profiles.in).toHaveBeenCalledWith("assigned_location_id", ["office-1", "district-1"])
    expect(documents.in).toHaveBeenCalledWith("user_id", ["staff-1"])
  })

  it.each([["bad", 50], ["0", 1], ["-1", 1], ["999", 200]])("bounds page size %s", async (value, expected) => {
    const { documents } = setup()
    await GET(new NextRequest(`http://localhost/api/admin/excuse-duty?per_page=${value}`))
    expect(documents.range).toHaveBeenCalledWith(0, expected)
  })
})