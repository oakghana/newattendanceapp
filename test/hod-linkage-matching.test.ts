import { describe, expect, it } from "vitest"
import { selectNonRegionalHodForStaff } from "../lib/hod-linkage-matching"

const hrStaff = {
  id: "staff-1",
  role: "staff",
  department_id: "hr-dept",
  assigned_location_id: "archive-location",
  departments: { id: "hr-dept", name: "HR", code: "HR" },
}

describe("automatic non-regional HOD matching", () => {
  it("matches HR staff to the same-department HR Manager when it is the only eligible role", () => {
    const hrManager = {
      id: "hr-manager",
      role: "manager_hr",
      department_id: "hr-dept",
      assigned_location_id: "head-office",
      first_name: "HR",
      last_name: "Manager",
      departments: { id: "hr-dept", name: "Human Resources", code: "HR" },
    }

    expect(selectNonRegionalHodForStaff(hrStaff, [hrManager])).toBe(hrManager)
  })

  it("prefers a matching HOD at the staff location over a higher-priority role elsewhere", () => {
    const headOfficeManager = {
      id: "hr-manager",
      role: "manager_hr",
      department_id: "hr-dept",
      assigned_location_id: "head-office",
      first_name: "HR",
      last_name: "Manager",
      departments: { id: "hr-dept", name: "HR", code: "HR" },
    }
    const localDirector = {
      id: "hr-director-local",
      role: "director_hr",
      department_id: "hr-dept",
      assigned_location_id: "archive-location",
      first_name: "Local",
      last_name: "Director",
      departments: { id: "hr-dept", name: "HR", code: "HR" },
    }

    expect(selectNonRegionalHodForStaff(hrStaff, [headOfficeManager, localDirector])).toBe(localDirector)
  })

  it("uses Accounts Executive and Transport Manager for their departments", () => {
    const accountsStaff = {
      ...hrStaff,
      department_id: "accounts-dept",
      departments: { id: "accounts-dept", name: "Accounts", code: "ACC" },
    }
    const transportStaff = {
      ...hrStaff,
      department_id: "transport-dept",
      departments: { id: "transport-dept", name: "Transport", code: "TRN" },
    }
    const accountsExecutive = { ...hrStaff, id: "ae", role: "accounts_executive", department_id: "accounts-dept", departments: accountsStaff.departments }
    const transportManager = { ...hrStaff, id: "tm", role: "transport_manager", department_id: "transport-dept", departments: transportStaff.departments }

    expect(selectNonRegionalHodForStaff(accountsStaff, [accountsExecutive])).toBe(accountsExecutive)
    expect(selectNonRegionalHodForStaff(transportStaff, [transportManager])).toBe(transportManager)
  })

  it("leaves a staff member unassigned rather than choosing an unrelated department's HOD", () => {
    const unrelatedHod = {
      id: "unrelated-hod",
      role: "department_head",
      department_id: "other-dept",
      assigned_location_id: "archive-location",
      departments: { id: "other-dept", name: "Marketing", code: "MKT" },
    }

    expect(selectNonRegionalHodForStaff(hrStaff, [unrelatedHod])).toBeNull()
  })
})
