"use client"

import { useState, useEffect, useMemo } from "react"
import { Gift, Users, Calendar, RefreshCw, Search } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

interface OutstandingLeave {
  id: string
  user_id: string
  staff_name: string
  employee_id: string
  department_name: string
  leave_year_period: string
  opening_balance: number
  entitlement_days: number
  used_this_period: number
  carryover_to_next_year: number
  max_carryover_allowed: number
  notes: string | null
}

const ITEMS_PER_PAGE = 10

export function OutstandingLeavePanel() {
  const [outstandingLeave, setOutstandingLeave] = useState<OutstandingLeave[]>([])
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [yearFilter, setYearFilter] = useState("2025/2026")
  const [loading, setLoading] = useState(false)

  // Load outstanding leave data
  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      try {
        const res = await fetch("/api/leave/hr-admin/outstanding")
        if (res.ok) {
          const data = await res.json()
          setOutstandingLeave(data.data || [])
        }
      } catch (err) {
        console.error("[v0] Failed to load outstanding leave:", err)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  // Filter and paginate
  const filtered = useMemo(() => {
    return (outstandingLeave || []).filter((o) => {
      if (o.leave_year_period !== yearFilter) return false
      const searchTerm = search.toLowerCase()
      const name = String(o.staff_name || "").toLowerCase()
      const empId = String(o.employee_id || "").toLowerCase()
      const dept = String(o.department_name || "").toLowerCase()
      return name.includes(searchTerm) || empId.includes(searchTerm) || dept.includes(searchTerm)
    })
  }, [outstandingLeave, yearFilter, search])

  const total = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE))
  const paginated = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE)

  // Calculate summary stats
  const summary = {
    totalStaff: filtered.length,
    totalUnused: filtered.reduce((sum, o) => sum + Math.max(0, o.entitlement_days - o.used_this_period), 0),
    totalCarryover: filtered.reduce((sum, o) => sum + (o.carryover_to_next_year || 0), 0),
    avgUtilization:
      filtered.length > 0
        ? Math.round(
            filtered.reduce((sum, o) => sum + (o.used_this_period / Math.max(1, o.entitlement_days)) * 100, 0) / filtered.length
          )
        : 0,
  }

  return (
    <div className="space-y-6 w-full">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-blue-900/40 to-blue-800/20 border-blue-700">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Users className="w-8 h-8 text-blue-400" />
              <div>
                <p className="text-2xl font-bold text-white">{summary.totalStaff}</p>
                <p className="text-xs text-blue-300">Staff with Balances</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-amber-900/40 to-amber-800/20 border-amber-700">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Calendar className="w-8 h-8 text-amber-400" />
              <div>
                <p className="text-2xl font-bold text-white">{summary.totalUnused}</p>
                <p className="text-xs text-amber-300">Total Unused Days</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-green-900/40 to-green-800/20 border-green-700">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Gift className="w-8 h-8 text-green-400" />
              <div>
                <p className="text-2xl font-bold text-white">{summary.totalCarryover}</p>
                <p className="text-xs text-green-300">Total Carryover Days</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-purple-900/40 to-purple-800/20 border-purple-700">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <RefreshCw className="w-8 h-8 text-purple-400" />
              <div>
                <p className="text-2xl font-bold text-white">{summary.avgUtilization}%</p>
                <p className="text-xs text-purple-300">Avg Utilization</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Table Card */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="text-white flex items-center gap-2">
                <Gift className="w-5 h-5 text-green-400" />
                Outstanding Leave Days
              </CardTitle>
              <CardDescription>Track unused Annual Leave and carryover balances</CardDescription>
            </div>
            <select
              value={yearFilter}
              onChange={(e) => {
                setYearFilter(e.target.value)
                setPage(1)
              }}
              className="px-3 py-2 rounded-md bg-slate-700 border border-slate-600 text-white text-sm"
            >
              <option value="2024/2025">2024/2025</option>
              <option value="2025/2026">2025/2026</option>
              <option value="2026/2027">2026/2027</option>
            </select>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search by name, employee ID, or department..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              className="pl-10 bg-slate-700 border-slate-600 text-white"
            />
          </div>

          {/* Table */}
          {loading ? (
            <div className="py-12 text-center">
              <RefreshCw className="w-8 h-8 mx-auto text-slate-400 mb-2 animate-spin" />
              <p className="text-slate-400">Loading outstanding leave data...</p>
            </div>
          ) : paginated.length === 0 ? (
            <div className="py-12 text-center">
              <Gift className="w-12 h-12 mx-auto text-slate-500 mb-4" />
              <p className="text-slate-400">No outstanding leave records found</p>
              <p className="text-slate-500 text-sm mt-1">Records will appear here when staff have unused leave balances</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left py-3 px-4 text-slate-300 font-semibold">Employee</th>
                    <th className="text-left py-3 px-4 text-slate-300 font-semibold">Department</th>
                    <th className="text-center py-3 px-4 text-slate-300 font-semibold">Entitlement</th>
                    <th className="text-center py-3 px-4 text-slate-300 font-semibold">Used</th>
                    <th className="text-center py-3 px-4 text-slate-300 font-semibold">Remaining</th>
                    <th className="text-center py-3 px-4 text-slate-300 font-semibold">Carryover</th>
                    <th className="text-left py-3 px-4 text-slate-300 font-semibold">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((record) => {
                    const remaining = Math.max(0, record.entitlement_days - record.used_this_period)
                    const utilizationPct = Math.round((record.used_this_period / Math.max(1, record.entitlement_days)) * 100)
                    return (
                      <tr key={record.id} className="border-b border-slate-700 hover:bg-slate-700/30">
                        <td className="py-3 px-4">
                          <p className="text-white font-medium">{record.staff_name}</p>
                          <p className="text-slate-400 text-xs">{record.employee_id}</p>
                        </td>
                        <td className="py-3 px-4 text-slate-300">{record.department_name}</td>
                        <td className="py-3 px-4 text-center text-white font-semibold">{record.entitlement_days}</td>
                        <td className="py-3 px-4 text-center">
                          <span className="text-white">{record.used_this_period}</span>
                          <span className="text-slate-400 text-xs ml-1">({utilizationPct}%)</span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span
                            className={`font-semibold ${remaining > 10 ? "text-green-400" : remaining > 5 ? "text-amber-400" : "text-red-400"}`}
                          >
                            {remaining}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          {record.carryover_to_next_year > 0 ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-green-900/30 text-green-400 text-xs font-medium">
                              <Gift className="w-3 h-3" />
                              {record.carryover_to_next_year} / {record.max_carryover_allowed}
                            </span>
                          ) : (
                            <span className="text-slate-500">-</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-400 text-sm max-w-[200px] truncate">{record.notes || "-"}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {total > 1 && (
            <div className="flex items-center justify-between pt-4">
              <p className="text-slate-400 text-sm">
                Showing {(page - 1) * ITEMS_PER_PAGE + 1} - {Math.min(page * ITEMS_PER_PAGE, filtered.length)} of {filtered.length}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="border-slate-600 text-slate-300"
                >
                  Previous
                </Button>
                <span className="text-slate-400 text-sm">
                  Page {page} of {total}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(total, p + 1))}
                  disabled={page === total}
                  className="border-slate-600 text-slate-300"
                >
                  Next
                </Button>
              </div>
            </div>
          )}

          {/* Info Notice */}
          <div className="mt-4 p-4 rounded-lg bg-blue-900/20 border border-blue-800">
            <h4 className="text-blue-300 font-medium mb-2">About Leave Carryover</h4>
            <ul className="text-blue-200 text-sm space-y-1">
              <li>Unused annual leave from the previous year can be carried over (max {paginated[0]?.max_carryover_allowed || 5} days by policy)</li>
              <li>Carryover days must be used within the first quarter of the new leave year</li>
              <li>Staff should plan ahead to avoid losing unused leave days</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
