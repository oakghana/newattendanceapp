import { describe, expect, it } from "vitest"
import {
  isRegionalManagerLocationMatch,
  regionalManagerEligibleLocationIds,
  resolveRegionalOfficeIdFromLocation,
  type LocationHierarchyRow,
} from "../lib/regional-manager-scope"

const centralRo: LocationHierarchyRow = {
  id: "ro-central",
  name: "Central Regional Office",
  location_type: "regional_office",
  parent_location_id: null,
}

const agonaDistrict: LocationHierarchyRow = {
  id: "dist-agona",
  name: "Agona Swedru District",
  location_type: "district_office",
  parent_location_id: "ro-central",
}

const byId = new Map<string, LocationHierarchyRow>([
  [centralRo.id, centralRo],
  [agonaDistrict.id, agonaDistrict],
])

describe("regional manager scope", () => {
  it("resolves district staff to the parent regional office", () => {
    expect(resolveRegionalOfficeIdFromLocation(agonaDistrict, byId)).toBe("ro-central")
    expect(regionalManagerEligibleLocationIds(agonaDistrict, byId).sort()).toEqual(
      ["dist-agona", "ro-central"].sort(),
    )
  })

  it("keeps regional office staff on the regional office itself", () => {
    expect(resolveRegionalOfficeIdFromLocation(centralRo, byId)).toBe("ro-central")
    expect(regionalManagerEligibleLocationIds(centralRo, byId)).toEqual(["ro-central"])
  })

  it("matches a Regional Manager stationed at the parent regional office", () => {
    expect(isRegionalManagerLocationMatch("dist-agona", agonaDistrict, "ro-central", byId)).toBe(true)
    expect(isRegionalManagerLocationMatch("dist-agona", agonaDistrict, "dist-agona", byId)).toBe(true)
    expect(isRegionalManagerLocationMatch("dist-agona", agonaDistrict, "other-ro", byId)).toBe(false)
  })

  it("does not treat non-regional sites as regional hierarchy", () => {
    const headOffice: LocationHierarchyRow = {
      id: "ho",
      name: "QCC Head Office",
      location_type: "facility",
      parent_location_id: null,
    }
    expect(resolveRegionalOfficeIdFromLocation(headOffice, byId)).toBeNull()
    expect(regionalManagerEligibleLocationIds(headOffice, byId)).toEqual([])
  })
})
