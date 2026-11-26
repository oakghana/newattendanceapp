import { normalizeRole } from "./loan-workflow"

export const AUTO_LINKABLE_HOD_ROLES = [
  "department_head",
  "manager_hr",
  "transport_manager",
  "director_hr",
  "hr_executive",
  "hr_executive_officer",
  "accounts_executive",
] as const

export type DepartmentLinkProfile = {
  id: string
  role: string
  department_id?: string | null
  assigned_location_id?: string | null
  first_name?: string | null
  last_name?: string | null
  departments?: { id?: string | null; name?: string | null; code?: string | null } | Array<{ id?: string | null; name?: string | null; code?: string | null }> | null
}

function firstDepartment(profile: DepartmentLinkProfile) {
  return Array.isArray(profile.departments) ? profile.departments[0] : profile.departments
}

function departmentKey(profile: DepartmentLinkProfile) {
  const department = firstDepartment(profile)
  return normalizeRole(`${department?.code || ""} ${department?.name || ""}`)
}

function departmentFamily(profile: DepartmentLinkProfile) {
  const key = departmentKey(profile)
  if (key.split("_").includes("hr") || key.includes("human_resource")) return "hr"
  if (key.includes("account")) return "accounts"
  if (key.includes("transport")) return "transport"
  return "general"
}

function rolePreference(profile: DepartmentLinkProfile) {
  switch (departmentFamily(profile)) {
    case "hr":
      return ["manager_hr", "director_hr", "hr_executive", "hr_executive_officer", "department_head"]
    case "accounts":
      return ["accounts_executive", "department_head"]
    case "transport":
      return ["transport_manager", "department_head"]
    default:
      return ["department_head"]
  }
}

function sameDepartment(staff: DepartmentLinkProfile, candidate: DepartmentLinkProfile) {
  const staffDepartmentId = String(staff.department_id || firstDepartment(staff)?.id || "")
  const candidateDepartmentId = String(candidate.department_id || firstDepartment(candidate)?.id || "")
  if (staffDepartmentId && candidateDepartmentId) return staffDepartmentId === candidateDepartmentId
  const staffKey = departmentKey(staff)
  return Boolean(staffKey && staffKey === departmentKey(candidate))
}

export function selectNonRegionalHodForStaff<T extends DepartmentLinkProfile>(
  staff: DepartmentLinkProfile,
  candidates: T[],
): T | null {
  const eligibleRoles = rolePreference(staff)
  const departmentCandidates = candidates.filter((candidate) =>
    candidate.id !== staff.id &&
    eligibleRoles.includes(normalizeRole(candidate.role)) &&
    sameDepartment(staff, candidate),
  )
  const staffLocationId = String(staff.assigned_location_id || "")
  const sameLocationCandidates = staffLocationId
    ? departmentCandidates.filter((candidate) => String(candidate.assigned_location_id || "") === staffLocationId)
    : []
  const preferredCandidates = sameLocationCandidates.length > 0 ? sameLocationCandidates : departmentCandidates

  return [...preferredCandidates].sort((left, right) => {
    const roleDifference = eligibleRoles.indexOf(normalizeRole(left.role)) - eligibleRoles.indexOf(normalizeRole(right.role))
    if (roleDifference !== 0) return roleDifference
    const leftName = `${left.first_name || ""} ${left.last_name || ""}`.trim()
    const rightName = `${right.first_name || ""} ${right.last_name || ""}`.trim()
    return leftName.localeCompare(rightName) || left.id.localeCompare(right.id)
  })[0] || null
}
