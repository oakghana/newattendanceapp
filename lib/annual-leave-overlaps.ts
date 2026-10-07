export interface AnnualLeaveOverlapGroup {
  department: string
  location: string
  month: string
  requests: Array<{
    id: string
    staffName: string
    startDate: string
    endDate: string
  }>
}

export function buildAnnualLeaveOverlapGroups(requests: any[]): AnnualLeaveOverlapGroup[] {
  const active = requests
    .filter((request) => request.leave_type_key === "annual" && !["rejected", "hr_rejected", "withdrawn"].includes(request.status))
    .map((request) => {
      const profile = Array.isArray(request.user_profiles) ? request.user_profiles[0] : request.user_profiles || {}
      const start = String(request.adjusted_preferred_start_date || request.preferred_start_date || "")
      const end = String(request.adjusted_preferred_end_date || request.preferred_end_date || "")
      return {
        id: String(request.id),
        start,
        end,
        department: profile.departments?.name || "Unassigned department",
        location: profile.geofence_locations?.name || "Unassigned location",
        staffName: `${profile.first_name || ""} ${profile.last_name || ""}`.trim() || "Staff member",
      }
    })
    .filter((request) => request.start && request.end)

  const groups = new Map<string, AnnualLeaveOverlapGroup>()
  for (let index = 0; index < active.length; index += 1) {
    for (let otherIndex = index + 1; otherIndex < active.length; otherIndex += 1) {
      const current = active[index]
      const other = active[otherIndex]
      if (current.department !== other.department || current.location !== other.location) continue
      if (current.start > other.end || other.start > current.end) continue
      const month = new Date(`${current.start}T00:00:00`).toLocaleDateString("en", { month: "long", year: "numeric" })
      const key = `${current.department}-${current.location}-${month}`
      const group: AnnualLeaveOverlapGroup = groups.get(key) || { department: current.department, location: current.location, month, requests: [] }
      for (const item of [current, other]) {
        if (!group.requests.some((request) => request.id === item.id)) {
          group.requests.push({ id: item.id, staffName: item.staffName, startDate: item.start, endDate: item.end })
        }
      }
      groups.set(key, group)
    }
  }
  return Array.from(groups.values()).sort((a, b) => b.requests.length - a.requests.length)
}
