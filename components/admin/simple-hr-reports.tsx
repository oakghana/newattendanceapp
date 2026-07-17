"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Users, Clock, CheckCircle, AlertTriangle, Search, Download, FileSpreadsheet, Loader2, CalendarIcon, MapPin, RefreshCcw } from "lucide-react"
import * as XLSX from "xlsx"

interface AttendanceRecord {
  id: string
  check_in_time: string
  check_out_time?: string
  work_hours?: number
  status: string
  user_profiles?: {
    first_name?: string
    last_name?: string
    employee_id?: string
    departments?: { name?: string }
    assigned_location?: { name?: string }
  }
}

interface SimpleHrReportsProps {
  scopeRole: string
  scopeDepartmentId: string | null
  scopeLocationId: string | null
}

function statsBg(status: string) {
  if (status === "present" || status === "on_time") return "bg-emerald-50 border-emerald-200 text-emerald-800"
  if (status === "late") return "bg-amber-50 border-amber-200 text-amber-800"
  if (status === "absent") return "bg-red-50 border-red-200 text-red-800"
  return "bg-blue-50 border-blue-200 text-blue-800"
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    present: "bg-emerald-100 text-emerald-800 border-emerald-300",
    on_time: "bg-emerald-100 text-emerald-800 border-emerald-300",
    late: "bg-amber-100 text-amber-800 border-amber-300",
    absent: "bg-red-100 text-red-800 border-red-300",
    half_day: "bg-blue-100 text-blue-800 border-blue-300",
  }
  return map[status] ?? "bg-gray-100 text-gray-800 border-gray-300"
}

export function SimpleHrReports({ scopeRole, scopeDepartmentId, scopeLocationId }: SimpleHrReportsProps) {
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date()
    d.setDate(1)
    return d.toISOString().slice(0, 10)
  })
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10))
  const [rowsPerPage, setRowsPerPage] = useState("50")
  const [departmentFilter, setDepartmentFilter] = useState("all")
  const [locationFilter, setLocationFilter] = useState("all")

  // Extract unique departments and locations from records
  const departments = Array.from(new Set(records.map(r => r.user_profiles?.departments?.name || "").filter(Boolean))).sort()
  const locations = Array.from(new Set(records.map(r => r.user_profiles?.assigned_location?.name || "").filter(Boolean))).sort()

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        startDate: dateFrom,
        endDate: dateTo,
        scopeRole,
        ...(scopeDepartmentId ? { departmentId: scopeDepartmentId } : {}),
        ...(scopeLocationId ? { locationId: scopeLocationId } : {}),
        limit: "500",
      })
      const res = await fetch(`/api/admin/reports/attendance?${params}`)
      if (!res.ok) return
      const json = await res.json()
      setRecords(json.data?.records || [])
    } finally {
      setLoading(false)
    }
  }, [dateFrom, dateTo, scopeRole, scopeDepartmentId, scopeLocationId])

  useEffect(() => { fetchData() }, [fetchData])

  // Filtered records
  const filtered = records.filter((r) => {
    const name = `${r.user_profiles?.first_name ?? ""} ${r.user_profiles?.last_name ?? ""}`.toLowerCase()
    const id = (r.user_profiles?.employee_id ?? "").toLowerCase()
    const dept = (r.user_profiles?.departments?.name ?? "").toLowerCase()
    const loc = (r.user_profiles?.assigned_location?.name ?? "").toLowerCase()
    const q = search.toLowerCase()
    const matchSearch = !q || name.includes(q) || id.includes(q) || dept.includes(q) || loc.includes(q)
    const matchStatus = statusFilter === "all" || r.status === statusFilter
    const matchDept = departmentFilter === "all" || dept === departmentFilter.toLowerCase()
    const matchLoc = locationFilter === "all" || loc === locationFilter.toLowerCase()
    return matchSearch && matchStatus && matchDept && matchLoc
  })

  // Stats
  const total = records.length
  const present = records.filter(r => r.status === "present" || r.status === "on_time").length
  const late = records.filter(r => r.status === "late").length
  const absent = records.filter(r => r.status === "absent").length
  const totalHours = records.reduce((s, r) => s + (r.work_hours ?? 0), 0)
  const avgHours = total > 0 ? (totalHours / total).toFixed(1) : "0.0"

  // Export
  const handleExcel = () => {
    const rows = filtered.map((r, i) => ({
      "#": i + 1,
      "Name": `${r.user_profiles?.first_name ?? ""} ${r.user_profiles?.last_name ?? ""}`.trim(),
      "Staff ID": r.user_profiles?.employee_id ?? "",
      "Department": r.user_profiles?.departments?.name ?? "",
      "Location": r.user_profiles?.assigned_location?.name ?? "",
      "Date": r.check_in_time ? new Date(r.check_in_time).toLocaleDateString("en-GB") : "",
      "Check In": r.check_in_time ? new Date(r.check_in_time).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "",
      "Check Out": r.check_out_time ? new Date(r.check_out_time).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "—",
      "Hours": r.work_hours ? Number(r.work_hours).toFixed(1) : "0.0",
      "Status": r.status,
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Attendance")
    XLSX.writeFile(wb, `attendance-report-${dateFrom}-to-${dateTo}.xlsx`)
  }

  const handleCSV = () => {
    const rows = filtered.map((r) => [
      `${r.user_profiles?.first_name ?? ""} ${r.user_profiles?.last_name ?? ""}`.trim(),
      r.user_profiles?.employee_id ?? "",
      r.user_profiles?.departments?.name ?? "",
      r.user_profiles?.assigned_location?.name ?? "",
      r.check_in_time ? new Date(r.check_in_time).toLocaleDateString("en-GB") : "",
      r.check_in_time ? new Date(r.check_in_time).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "",
      r.check_out_time ? new Date(r.check_out_time).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "",
      r.work_hours ? Number(r.work_hours).toFixed(1) : "0",
      r.status,
    ])
    const header = ["Name", "Staff ID", "Department", "Location", "Date", "Check In", "Check Out", "Hours", "Status"]
    const csv = [header, ...rows].map(row => row.map(v => `"${v}"`).join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `attendance-report-${dateFrom}-to-${dateTo}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border">
          <CardContent className="pt-5 pb-4 px-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-50 text-blue-600"><Users className="h-5 w-5" /></div>
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Total Records</p>
                <p className="text-2xl font-bold text-foreground">{total}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border">
          <CardContent className="pt-5 pb-4 px-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600"><CheckCircle className="h-5 w-5" /></div>
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Present</p>
                <p className="text-2xl font-bold text-foreground">{present}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border">
          <CardContent className="pt-5 pb-4 px-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-50 text-amber-600"><AlertTriangle className="h-5 w-5" /></div>
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Late</p>
                <p className="text-2xl font-bold text-foreground">{late}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border">
          <CardContent className="pt-5 pb-4 px-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-50 text-purple-600"><Clock className="h-5 w-5" /></div>
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Avg Hours</p>
                <p className="text-2xl font-bold text-foreground">{avgHours}h</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters + Export */}
      <Card className="border">
        <CardContent className="pt-5 pb-4 px-5">
          <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
            {/* Date range */}
            <div className="flex items-center gap-2">
              <CalendarIcon className="h-4 w-4 text-muted-foreground shrink-0" />
              <input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <span className="text-muted-foreground text-sm">to</span>
              <input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            {/* Status filter */}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 w-40">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="present">Present</SelectItem>
                <SelectItem value="on_time">On Time</SelectItem>
                <SelectItem value="late">Late</SelectItem>
                <SelectItem value="absent">Absent</SelectItem>
                <SelectItem value="half_day">Half Day</SelectItem>
              </SelectContent>
            </Select>
            {/* Rows per page */}
            <Select value={rowsPerPage} onValueChange={setRowsPerPage}>
              <SelectTrigger className="h-9 w-32">
                <SelectValue placeholder="Rows" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="50">50 rows</SelectItem>
                <SelectItem value="100">100 rows</SelectItem>
                <SelectItem value="200">200 rows</SelectItem>
                <SelectItem value="1000">1000 rows</SelectItem>
              </SelectContent>
            </Select>
            {/* Department filter */}
            <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
              <SelectTrigger className="h-9 w-40">
                <SelectValue placeholder="All departments" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Departments</SelectItem>
                {departments.map(dept => (
                  <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* Location filter */}
            <Select value={locationFilter} onValueChange={setLocationFilter}>
              <SelectTrigger className="h-9 w-40">
                <SelectValue placeholder="All locations" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Locations</SelectItem>
                {locations.map(loc => (
                  <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, ID or department..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
            <Button onClick={fetchData} variant="outline" size="sm" className="h-9 gap-1.5">
              <RefreshCcw className="h-4 w-4" />
              Refresh
            </Button>
            {/* Export buttons */}
            <Button onClick={handleExcel} variant="outline" size="sm" className="h-9 gap-1.5 text-green-700 border-green-200 hover:bg-green-50">
              <FileSpreadsheet className="h-4 w-4" />
              Excel
            </Button>
            <Button onClick={handleCSV} variant="outline" size="sm" className="h-9 gap-1.5">
              <Download className="h-4 w-4" />
              CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Records table */}
      <Card className="border">
        <CardHeader className="pb-3 pt-5 px-5">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold">
              Attendance Records
            </CardTitle>
            <span className="text-sm text-muted-foreground">{filtered.length} record{filtered.length !== 1 ? "s" : ""}</span>
          </div>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {loading ? (
            <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Loading records...</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground text-sm">
              No records found for the selected period.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="px-5 py-3 text-left font-medium text-muted-foreground">#</th>
                    <th className="px-5 py-3 text-left font-medium text-muted-foreground">Name</th>
                    <th className="px-5 py-3 text-left font-medium text-muted-foreground">Staff ID</th>
                    <th className="px-5 py-3 text-left font-medium text-muted-foreground">Department</th>
                    <th className="px-5 py-3 text-left font-medium text-muted-foreground">Location</th>
                    <th className="px-5 py-3 text-left font-medium text-muted-foreground">Date</th>
                    <th className="px-5 py-3 text-left font-medium text-muted-foreground">Check In</th>
                    <th className="px-5 py-3 text-left font-medium text-muted-foreground">Check Out</th>
                    <th className="px-5 py-3 text-left font-medium text-muted-foreground">Hours</th>
                    <th className="px-5 py-3 text-left font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.slice(0, parseInt(rowsPerPage)).map((r, i) => {
                    const name = `${r.user_profiles?.first_name ?? ""} ${r.user_profiles?.last_name ?? ""}`.trim() || "—"
                    const checkin = r.check_in_time ? new Date(r.check_in_time) : null
                    const checkout = r.check_out_time ? new Date(r.check_out_time) : null
                    return (
                      <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-5 py-3 text-muted-foreground">{i + 1}</td>
                        <td className="px-5 py-3 font-medium">{name}</td>
                        <td className="px-5 py-3 text-muted-foreground">{r.user_profiles?.employee_id ?? "—"}</td>
                        <td className="px-5 py-3 text-muted-foreground">{r.user_profiles?.departments?.name ?? "—"}</td>
                        <td className="px-5 py-3 text-muted-foreground text-sm">{r.user_profiles?.assigned_location?.name ?? "—"}</td>
                        <td className="px-5 py-3 text-muted-foreground">{checkin ? checkin.toLocaleDateString("en-GB") : "—"}</td>
                        <td className="px-5 py-3">{checkin ? checkin.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                        <td className="px-5 py-3 text-muted-foreground">{checkout ? checkout.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                        <td className="px-5 py-3">{r.work_hours ? Number(r.work_hours).toFixed(1) + "h" : "—"}</td>
                        <td className="px-5 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${statusBadge(r.status)}`}>
                            {r.status?.replace(/_/g, " ") ?? "unknown"}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {filtered.length > 200 && (
                <p className="px-5 py-3 text-xs text-muted-foreground border-t">
                  Showing 200 of {filtered.length} records. Refine your date range or search to see more.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
