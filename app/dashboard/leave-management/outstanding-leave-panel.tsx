"use client"

import { useState, useEffect, useMemo } from "react"
import { Gift, Users, Calendar, RefreshCw, Search, Plus, X, ListFilter, FileSpreadsheet, Download, MapPin } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

interface StaffOption {
  id: string
  employee_id: string
  first_name: string
  last_name: string
  department_name: string
  region_name?: string
  region_id?: string | null
}

interface RegionOption {
  id: string
  name: string
}

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
  const [activeTab, setActiveTab] = useState("view")

  // Add form state
  const [staffList, setStaffList] = useState<StaffOption[]>([])
  const [staffSearch, setStaffSearch] = useState("")
  const [selectedStaff, setSelectedStaff] = useState<StaffOption | null>(null)
  const [formData, setFormData] = useState({
    leave_year_period: "2025/2026",
    opening_balance: 0,
    entitlement_days: 21,
    used_this_period: 0,
    carryover_to_next_year: 0,
    max_carryover_allowed: 5,
    notes: "",
  })
  const [saving, setSaving] = useState(false)

  // Hardcoded Cocoa Board regions/locations
  const COCOA_REGIONS = [
    { id: "all",             name: "All Regions / Locations" },
    { id: "greater_accra",   name: "Greater Accra" },
    { id: "ashanti",         name: "Ashanti Region" },
    { id: "western_north",   name: "Western North" },
    { id: "western_south",   name: "Western South" },
    { id: "central",         name: "Central Region" },
    { id: "volta",           name: "Volta Region" },
    { id: "brong_ahafo",     name: "Brong Ahafo Region" },
    { id: "tema_port",       name: "Tema Port" },
    { id: "kaase_port",      name: "Kaase Port" },
    { id: "takoradi_port",   name: "Takoradi Port" },
  ]

  // Report generation state
  const [regions, setRegions] = useState<RegionOption[]>([])
  const [selectedRegion, setSelectedRegion] = useState<string>("all")
  const [reportPeriod, setReportPeriod] = useState<"monthly" | "weekly" | "quarterly">("monthly")
  const [reportMonth, setReportMonth] = useState<string>(new Date().toISOString().slice(0, 7))
  const [reportWeek, setReportWeek] = useState<string>(new Date().toISOString().slice(0, 10))
  const [reportQuarter, setReportQuarter] = useState<string>(() => {
    const month = new Date().getMonth() + 1
    const year = new Date().getFullYear()
    const q = Math.ceil(month / 3)
    return `Q${q} ${year}`
  })
  const [generatingReport, setGeneratingReport] = useState(false)

  // Year-end carryover state
  const [carryoverFromYear, setCarryoverFromYear] = useState<string>("2024/2025")
  const [carryoverToYear, setCarryoverToYear] = useState<string>("2025/2026")
  const [carryoverRegion, setCarryoverRegion] = useState<string>("all")
  const [runningCarryover, setRunningCarryover] = useState(false)
  const [carryoverResults, setCarryoverResults] = useState<any>(null)
  const [carryoverDryRun, setCarryoverDryRun] = useState(true)

  // Load staff list and regions for add form
  useEffect(() => {
    const loadStaff = async () => {
      try {
        const res = await fetch("/api/staff/list")
        if (res.ok) {
          const data = await res.json()
          setStaffList(data.staff || [])
          
          // Extract unique regions from staff list
          const uniqueRegions = new Map<string, string>()
          ;(data.staff || []).forEach((s: StaffOption) => {
            if (s.region_id && s.region_name) {
              uniqueRegions.set(s.region_id, s.region_name)
            }
          })
          setRegions(Array.from(uniqueRegions, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)))
        }
      } catch (err) {
        console.error("[v0] Failed to load staff list:", err)
      }
    }
    loadStaff()
  }, [])

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

  // Filter staff list for add form - show more results for better searching
  const filteredStaffList = useMemo(() => {
    if (!staffSearch || staffSearch.length < 2) return []
    const term = staffSearch.toLowerCase().trim()
    const terms = term.split(/\s+/)
    return staffList
      .filter((s) => {
        const fullName = `${s.first_name || ""} ${s.last_name || ""}`.toLowerCase()
        const empId = (s.employee_id || "").toLowerCase()
        const dept = (s.department_name || "").toLowerCase()
        // Match all terms (for "mama lee" to match first_name and last_name)
        return terms.every(t => 
          fullName.includes(t) || 
          empId.includes(t) || 
          dept.includes(t)
        )
      })
      .slice(0, 50) // Show up to 50 results
  }, [staffList, staffSearch])

  // Compute human-readable period label for filename / display
  const periodLabel = (() => {
    if (reportPeriod === "monthly") {
      return new Date(reportMonth + "-01").toLocaleDateString("en-US", { month: "long", year: "numeric" })
    }
    if (reportPeriod === "weekly") {
      return `Week of ${new Date(reportWeek).toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" })}`
    }
    return reportQuarter
  })()

  const regionLabel = COCOA_REGIONS.find(r => r.id === selectedRegion)?.name || "All Regions"

  // Generate leave report (monthly / weekly / quarterly)
  const generateReport = async () => {
    setGeneratingReport(true)
    try {
      const params = new URLSearchParams({
        period: reportPeriod,
        year_period: yearFilter,
        ...(selectedRegion !== "all" && { region: selectedRegion }),
        // Period-specific date params
        ...(reportPeriod === "monthly"   && { month: reportMonth }),
        ...(reportPeriod === "weekly"    && { week_start: reportWeek }),
        ...(reportPeriod === "quarterly" && { quarter: reportQuarter }),
      })

      const res = await fetch(`/api/leave/reports/monthly?${params.toString()}`)
      if (res.ok) {
        const blob = await res.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        const regionSlug = selectedRegion !== "all" ? `-${selectedRegion}` : ""
        a.download = `leave-report-${reportPeriod}${regionSlug}-${reportMonth || reportWeek || reportQuarter.replace(" ", "_")}.csv`
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        a.remove()
      } else {
        alert("Failed to generate report. Please try again.")
      }
    } catch (err) {
      console.error("[v0] Failed to generate report:", err)
      alert("Failed to generate report. Please try again.")
    } finally {
      setGeneratingReport(false)
    }
  }

  // Run year-end carryover (auto-populate outstanding leave)
  const runCarryover = async () => {
    setRunningCarryover(true)
    setCarryoverResults(null)
    try {
      const res = await fetch("/api/leave/hr-admin/outstanding/auto-populate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from_year_period: carryoverFromYear,
          to_year_period: carryoverToYear,
          region_id: carryoverRegion,
          dry_run: carryoverDryRun,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setCarryoverResults(data)
        if (!carryoverDryRun) {
          // Refresh outstanding leave data
          loadOutstandingLeave()
        }
      } else {
        alert(data.error || "Failed to run carryover")
      }
    } catch (err) {
      console.error("[v0] Carryover error:", err)
      alert("Failed to run carryover. Please try again.")
    } finally {
      setRunningCarryover(false)
    }
  }

  // Save outstanding leave record
  const handleSave = async () => {
    if (!selectedStaff) return
    setSaving(true)
    try {
      const res = await fetch("/api/leave/hr-admin/outstanding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: selectedStaff.id,
          ...formData,
        }),
      })
      if (res.ok) {
        setSelectedStaff(null)
        setStaffSearch("")
        setFormData({
          leave_year_period: "2025/2026",
          opening_balance: 0,
          entitlement_days: 21,
          used_this_period: 0,
          carryover_to_next_year: 0,
          max_carryover_allowed: 5,
          notes: "",
        })
        // Reload data and switch to view tab
        const loadRes = await fetch("/api/leave/hr-admin/outstanding")
        if (loadRes.ok) {
          const data = await loadRes.json()
          setOutstandingLeave(data.data || [])
        }
        setActiveTab("view")
      }
    } catch (err) {
      console.error("[v0] Failed to save outstanding leave:", err)
    } finally {
      setSaving(false)
    }
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

      {/* Tabs for View/Add/Reports */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="flex h-auto w-full flex-wrap gap-2 rounded-xl border border-slate-600 bg-slate-700/50 p-2">
          <TabsTrigger value="view" className="gap-2 rounded-lg border border-slate-500 bg-slate-600 px-4 py-2 text-sm text-slate-200 hover:bg-slate-500 data-[state=active]:border-green-500 data-[state=active]:bg-green-600 data-[state=active]:text-white">
            <ListFilter className="h-4 w-4" />
            View Records
          </TabsTrigger>
          <TabsTrigger value="add" className="gap-2 rounded-lg border border-slate-500 bg-slate-600 px-4 py-2 text-sm text-slate-200 hover:bg-slate-500 data-[state=active]:border-blue-500 data-[state=active]:bg-blue-600 data-[state=active]:text-white">
            <Plus className="h-4 w-4" />
            Add Outstanding Days
          </TabsTrigger>
          <TabsTrigger value="carryover" className="gap-2 rounded-lg border border-slate-500 bg-slate-600 px-4 py-2 text-sm text-slate-200 hover:bg-slate-500 data-[state=active]:border-purple-500 data-[state=active]:bg-purple-600 data-[state=active]:text-white">
            <RefreshCw className="h-4 w-4" />
            Year-End Carryover
          </TabsTrigger>
          <TabsTrigger value="reports" className="gap-2 rounded-lg border border-slate-500 bg-slate-600 px-4 py-2 text-sm text-slate-200 hover:bg-slate-500 data-[state=active]:border-amber-500 data-[state=active]:bg-amber-600 data-[state=active]:text-white">
            <FileSpreadsheet className="h-4 w-4" />
            Generate Reports
          </TabsTrigger>
        </TabsList>

        {/* View Records Tab */}
        <TabsContent value="view" className="mt-4">
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

          {/* Policy Notice */}
          <div className="mt-4 p-4 rounded-lg bg-slate-700/40 border border-slate-600">
            <p className="text-slate-300 text-sm leading-relaxed">
              Policy details for outstanding and carried-over leave days will be made available soon. In the meantime, please reach out to the HR Leave Office for any clarification.
            </p>
          </div>
        </CardContent>
      </Card>
        </TabsContent>

        {/* Add Outstanding Days Tab */}
        <TabsContent value="add" className="mt-4">
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-blue-400" />
                Add Outstanding Leave Days
              </CardTitle>
              <CardDescription>
                Record unused leave balances for staff members. This information will be visible during HR review decisions.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Staff Selection */}
              <div className="space-y-2">
                <Label className="text-slate-300">Select Staff Member</Label>
                {selectedStaff ? (
                  <div className="flex items-center justify-between bg-slate-700 rounded-lg p-4">
                    <div>
                      <p className="font-medium text-white">{selectedStaff.first_name} {selectedStaff.last_name}</p>
                      <p className="text-sm text-slate-400">{selectedStaff.employee_id} - {selectedStaff.department_name}</p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setSelectedStaff(null)} className="text-slate-400 hover:text-white">
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <Input
                        placeholder="Search by name or employee ID..."
                        value={staffSearch}
                        onChange={(e) => setStaffSearch(e.target.value)}
                        className="bg-slate-700 border-slate-600 pl-10"
                      />
                    </div>
                    {staffSearch && filteredStaffList.length > 0 && (
                      <div className="bg-slate-700 rounded-lg border border-slate-600 max-h-48 overflow-y-auto">
                        {filteredStaffList.map((s) => (
                          <button
                            key={s.id}
                            onClick={() => {
                              setSelectedStaff(s)
                              setStaffSearch("")
                            }}
                            className="w-full text-left px-4 py-3 hover:bg-slate-600 border-b border-slate-600 last:border-b-0 transition-colors"
                          >
                            <p className="font-medium text-white">{s.first_name} {s.last_name}</p>
                            <p className="text-xs text-slate-400">{s.employee_id} - {s.department_name}</p>
                          </button>
                        ))}
                      </div>
                    )}
                    {staffSearch && staffSearch.length < 2 && (
                      <p className="text-slate-400 text-sm py-2">Type at least 2 characters to search...</p>
                    )}
                    {staffSearch && staffSearch.length >= 2 && filteredStaffList.length === 0 && (
                      <p className="text-slate-400 text-sm py-2">No staff found matching your search.</p>
                    )}
                  </div>
                )}
              </div>

              {/* Leave Year Period */}
              <div className="space-y-2">
                <Label className="text-slate-300">Leave Year Period</Label>
                <select
                  value={formData.leave_year_period}
                  onChange={(e) => setFormData((f) => ({ ...f, leave_year_period: e.target.value }))}
                  className="w-full px-3 py-2 rounded-md bg-slate-700 border border-slate-600 text-white"
                >
                  <option value="2024/2025">2024/2025</option>
                  <option value="2025/2026">2025/2026</option>
                  <option value="2026/2027">2026/2027</option>
                </select>
              </div>

              {/* Numeric fields in a grid */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <Label className="text-slate-300 text-sm">Entitlement Days</Label>
                  <Input
                    type="number"
                    value={formData.entitlement_days}
                    onChange={(e) => setFormData((f) => ({ ...f, entitlement_days: Number(e.target.value) }))}
                    className="bg-slate-700 border-slate-600"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-slate-300 text-sm">Opening Balance</Label>
                  <Input
                    type="number"
                    value={formData.opening_balance}
                    onChange={(e) => setFormData((f) => ({ ...f, opening_balance: Number(e.target.value) }))}
                    className="bg-slate-700 border-slate-600"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-slate-300 text-sm">Used This Period</Label>
                  <Input
                    type="number"
                    value={formData.used_this_period}
                    onChange={(e) => setFormData((f) => ({ ...f, used_this_period: Number(e.target.value) }))}
                    className="bg-slate-700 border-slate-600"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-slate-300 text-sm">Carryover Days</Label>
                  <Input
                    type="number"
                    value={formData.carryover_to_next_year}
                    onChange={(e) => setFormData((f) => ({ ...f, carryover_to_next_year: Number(e.target.value) }))}
                    className="bg-slate-700 border-slate-600"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-slate-300 text-sm">Max Carryover Allowed</Label>
                  <Input
                    type="number"
                    value={formData.max_carryover_allowed}
                    onChange={(e) => setFormData((f) => ({ ...f, max_carryover_allowed: Number(e.target.value) }))}
                    className="bg-slate-700 border-slate-600"
                  />
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <Label className="text-slate-300">Notes (Optional)</Label>
                <Textarea
                  value={formData.notes}
                  onChange={(e) => setFormData((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Additional notes about this balance record..."
                  className="bg-slate-700 border-slate-600 min-h-[80px]"
                />
              </div>

              {/* Save Button */}
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-700">
                <Button
                  variant="outline"
                  onClick={() => {
                    setSelectedStaff(null)
                    setStaffSearch("")
                    setActiveTab("view")
                  }}
                  className="border-slate-600"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={!selectedStaff || saving}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {saving ? "Saving..." : "Save Outstanding Record"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Generate Reports Tab */}
        <TabsContent value="reports" className="mt-4">
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-amber-400" />
                Generate Leave Report
              </CardTitle>
              <CardDescription>
                Download leave reports by period and Cocoa Board region. Output is CSV (Excel compatible).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">

              {/* Row 1 — Report Period selector */}
              <div className="space-y-2">
                <Label className="text-slate-300">Report Period</Label>
                <div className="flex gap-2 flex-wrap">
                  {(["monthly", "weekly", "quarterly"] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setReportPeriod(p)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors capitalize ${
                        reportPeriod === p
                          ? "bg-amber-600 border-amber-500 text-white"
                          : "bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600"
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              {/* Row 2 — Date picker (changes based on period) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  {reportPeriod === "monthly" && (
                    <>
                      <Label className="text-slate-300">Select Month</Label>
                      <Input
                        type="month"
                        value={reportMonth}
                        onChange={(e) => setReportMonth(e.target.value)}
                        className="bg-slate-700 border-slate-600 text-white"
                      />
                    </>
                  )}
                  {reportPeriod === "weekly" && (
                    <>
                      <Label className="text-slate-300">Select Week Start Date</Label>
                      <Input
                        type="date"
                        value={reportWeek}
                        onChange={(e) => setReportWeek(e.target.value)}
                        className="bg-slate-700 border-slate-600 text-white"
                      />
                    </>
                  )}
                  {reportPeriod === "quarterly" && (
                    <>
                      <Label className="text-slate-300">Select Quarter</Label>
                      <select
                        value={reportQuarter}
                        onChange={(e) => setReportQuarter(e.target.value)}
                        className="w-full px-3 py-2 rounded-md bg-slate-700 border border-slate-600 text-white h-10"
                      >
                        {[2024, 2025, 2026].flatMap((yr) =>
                          ["Q1", "Q2", "Q3", "Q4"].map((q) => (
                            <option key={`${q} ${yr}`} value={`${q} ${yr}`}>{q} {yr}</option>
                          ))
                        )}
                      </select>
                    </>
                  )}
                </div>

                {/* Leave Year Period */}
                <div className="space-y-2">
                  <Label className="text-slate-300">Leave Year Period</Label>
                  <select
                    value={yearFilter}
                    onChange={(e) => setYearFilter(e.target.value)}
                    className="w-full px-3 py-2 rounded-md bg-slate-700 border border-slate-600 text-white h-10"
                  >
                    <option value="2024/2025">2024/2025</option>
                    <option value="2025/2026">2025/2026</option>
                    <option value="2026/2027">2026/2027</option>
                  </select>
                </div>
              </div>

              {/* Row 3 — Cocoa Board Region/Location dropdown */}
              <div className="space-y-2">
                <Label className="text-slate-300 flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> Cocoa Board Region / Location
                </Label>
                <select
                  value={selectedRegion}
                  onChange={(e) => setSelectedRegion(e.target.value)}
                  className="w-full px-3 py-2 rounded-md bg-slate-700 border border-slate-600 text-white h-10"
                >
                  {COCOA_REGIONS.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>

              {/* Report Preview summary */}
              <div className="bg-slate-700/50 rounded-lg p-4 border border-slate-600 space-y-1">
                <h4 className="font-medium text-white mb-2">Report Summary</h4>
                <p className="text-sm text-slate-300">
                  <span className="text-slate-400">Period type:</span>{" "}
                  <strong className="text-white capitalize">{reportPeriod}</strong>
                </p>
                <p className="text-sm text-slate-300">
                  <span className="text-slate-400">Period:</span>{" "}
                  <strong className="text-white">{periodLabel}</strong>
                </p>
                <p className="text-sm text-slate-300">
                  <span className="text-slate-400">Leave year:</span>{" "}
                  <strong className="text-white">{yearFilter}</strong>
                </p>
                <p className="text-sm text-slate-300">
                  <span className="text-slate-400">Location:</span>{" "}
                  <strong className="text-white">{regionLabel}</strong>
                </p>
                <p className="text-sm text-slate-300">
                  <span className="text-slate-400">Format:</span>{" "}
                  <strong className="text-white">CSV (Excel compatible)</strong>
                </p>
              </div>

              {/* Generate Button */}
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-700">
                <Button
                  onClick={generateReport}
                  disabled={generatingReport}
                  className="bg-amber-600 hover:bg-amber-700 gap-2"
                >
                  <Download className="w-4 h-4" />
                  {generatingReport ? "Generating..." : `Generate ${reportPeriod.charAt(0).toUpperCase() + reportPeriod.slice(1)} Report`}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Year-End Carryover Tab */}
        <TabsContent value="carryover" className="mt-4">
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <RefreshCw className="w-5 h-5 text-purple-400" />
                Year-End Outstanding Leave Carryover
              </CardTitle>
              <CardDescription>
                Auto-populate outstanding leave for staff who didn&apos;t use all their annual leave days when a leave year ends.
                Unused days (up to max carryover) will be carried over to the new year.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* From Year */}
                <div className="space-y-2">
                  <Label className="text-slate-300">From Year Period (Ending)</Label>
                  <select
                    value={carryoverFromYear}
                    onChange={(e) => setCarryoverFromYear(e.target.value)}
                    className="w-full px-3 py-2 rounded-md bg-slate-700 border border-slate-600 text-white h-10"
                  >
                    <option value="2024/2025">2024/2025</option>
                    <option value="2025/2026">2025/2026</option>
                    <option value="2026/2027">2026/2027</option>
                  </select>
                </div>

                {/* To Year */}
                <div className="space-y-2">
                  <Label className="text-slate-300">To Year Period (New)</Label>
                  <select
                    value={carryoverToYear}
                    onChange={(e) => setCarryoverToYear(e.target.value)}
                    className="w-full px-3 py-2 rounded-md bg-slate-700 border border-slate-600 text-white h-10"
                  >
                    <option value="2025/2026">2025/2026</option>
                    <option value="2026/2027">2026/2027</option>
                    <option value="2027/2028">2027/2028</option>
                  </select>
                </div>

                {/* Region Filter */}
                <div className="space-y-2">
                  <Label className="text-slate-300 flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> Region / Location
                  </Label>
                  <select
                    value={carryoverRegion}
                    onChange={(e) => setCarryoverRegion(e.target.value)}
                    className="w-full px-3 py-2 rounded-md bg-slate-700 border border-slate-600 text-white h-10"
                  >
                    {COCOA_REGIONS.map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Dry Run Toggle */}
              <div className="flex items-center gap-3 p-4 bg-slate-700/50 rounded-lg border border-slate-600">
                <input
                  type="checkbox"
                  id="dryRunToggle"
                  checked={carryoverDryRun}
                  onChange={(e) => setCarryoverDryRun(e.target.checked)}
                  className="w-5 h-5 rounded border-slate-500"
                />
                <label htmlFor="dryRunToggle" className="text-slate-300">
                  <strong className="text-white">Preview Mode (Dry Run)</strong>
                  <span className="block text-xs text-slate-400">
                    When enabled, shows what would be created without actually saving. Uncheck to apply changes.
                  </span>
                </label>
              </div>

              {/* Run Button */}
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-700">
                <Button
                  onClick={runCarryover}
                  disabled={runningCarryover}
                  className={carryoverDryRun ? "bg-blue-600 hover:bg-blue-700 gap-2" : "bg-purple-600 hover:bg-purple-700 gap-2"}
                >
                  <RefreshCw className={`w-4 h-4 ${runningCarryover ? "animate-spin" : ""}`} />
                  {runningCarryover
                    ? "Processing..."
                    : carryoverDryRun
                    ? "Preview Carryover"
                    : "Apply Carryover Now"}
                </Button>
              </div>

              {/* Results */}
              {carryoverResults && (
                <div className="mt-6 space-y-4">
                  <div className="bg-slate-700/50 rounded-lg p-4 border border-slate-600">
                    <h4 className="font-medium text-white mb-3 flex items-center gap-2">
                      {carryoverResults.dry_run ? (
                        <span className="text-blue-400">Preview Results</span>
                      ) : (
                        <span className="text-green-400">Carryover Applied</span>
                      )}
                    </h4>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
                      <div className="bg-slate-800 rounded-lg p-3">
                        <p className="text-2xl font-bold text-white">{carryoverResults.summary?.total_staff || 0}</p>
                        <p className="text-xs text-slate-400">Total Staff</p>
                      </div>
                      <div className="bg-slate-800 rounded-lg p-3">
                        <p className="text-2xl font-bold text-green-400">{carryoverResults.summary?.created || 0}</p>
                        <p className="text-xs text-slate-400">New Records</p>
                      </div>
                      <div className="bg-slate-800 rounded-lg p-3">
                        <p className="text-2xl font-bold text-blue-400">{carryoverResults.summary?.updated || 0}</p>
                        <p className="text-xs text-slate-400">Updated</p>
                      </div>
                      <div className="bg-slate-800 rounded-lg p-3">
                        <p className="text-2xl font-bold text-slate-400">{carryoverResults.summary?.no_unused || 0}</p>
                        <p className="text-xs text-slate-400">No Unused Days</p>
                      </div>
                      <div className="bg-slate-800 rounded-lg p-3">
                        <p className="text-2xl font-bold text-amber-400">{carryoverResults.summary?.total_carryover_days || 0}</p>
                        <p className="text-xs text-slate-400">Total Carryover Days</p>
                      </div>
                    </div>
                  </div>

                  {/* Detailed Results Table */}
                  {carryoverResults.results?.length > 0 && (
                    <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-600">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-700 sticky top-0">
                          <tr>
                            <th className="text-left p-2 text-slate-300">Staff</th>
                            <th className="text-left p-2 text-slate-300">Region</th>
                            <th className="text-center p-2 text-slate-300">Entitlement</th>
                            <th className="text-center p-2 text-slate-300">Used</th>
                            <th className="text-center p-2 text-slate-300">Unused</th>
                            <th className="text-center p-2 text-slate-300">Carryover</th>
                            <th className="text-center p-2 text-slate-300">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {carryoverResults.results.slice(0, 50).map((r: any, idx: number) => (
                            <tr key={idx} className="border-t border-slate-700 hover:bg-slate-700/50">
                              <td className="p-2 text-white">{r.staff_name}</td>
                              <td className="p-2 text-slate-400">{r.region_name}</td>
                              <td className="p-2 text-center text-slate-300">{r.entitlement}</td>
                              <td className="p-2 text-center text-red-400">{r.used}</td>
                              <td className="p-2 text-center text-blue-400">{r.unused}</td>
                              <td className="p-2 text-center text-green-400 font-semibold">{r.carryover}</td>
                              <td className="p-2 text-center">
                                <span className={`text-xs px-2 py-1 rounded ${
                                  r.status === "created" ? "bg-green-800 text-green-200" :
                                  r.status === "updated" ? "bg-blue-800 text-blue-200" :
                                  "bg-slate-600 text-slate-300"
                                }`}>
                                  {r.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {carryoverResults.results.length > 50 && (
                        <p className="text-center text-slate-400 text-xs py-2">
                          Showing 50 of {carryoverResults.results.length} results
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
