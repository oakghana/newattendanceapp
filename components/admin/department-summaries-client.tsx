"use client"

import { useState, useEffect, useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  Calendar,
  Download,
  TrendingUp,
  Users,
  AlertTriangle,
  ArrowLeft,
  Search,
  X,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react"
import Link from "next/link"

interface Summary {
  userId: string
  name: string
  email: string
  employeeId: string
  department: string
  daysWorked: number
  daysAbsent: number
  totalWorkHours: string
  daysOnTime: number
  daysLate: number
  attendanceRate: string
  status: string
  hasCheckedOutToday: boolean
  isActive?: boolean
  leaveStatus?: string
  leaveStartDate?: string
  leaveEndDate?: string
}

interface AttendanceDetail {
  date: string
  checkInTime: string | null
  checkOutTime: string | null
  workHours: number
  status: string
  location: string
}

interface DepartmentSummariesClientProps {
  userRole: string
  departmentId?: string
}

export function DepartmentSummariesClient({ userRole, departmentId }: DepartmentSummariesClientProps) {
  const [period, setPeriod] = useState<"weekly" | "monthly" | "yearly">("weekly")
  const [summaries, setSummaries] = useState<Summary[]>([])
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useState({ start: "", end: "" })
  const [totalStaff, setTotalStaff] = useState(0)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedDepartment, setSelectedDepartment] = useState<string>("all")
  const [selectedWeek, setSelectedWeek] = useState<string>("current")
  const [selectedMonth, setSelectedMonth] = useState<string>(new Date().toISOString().slice(0, 7))
  const [departments, setDepartments] = useState<Array<{ id: string; name: string }>>([])
  const [selectedStaff, setSelectedStaff] = useState<Summary | null>(null)
  const [staffAttendanceDetails, setStaffAttendanceDetails] = useState<AttendanceDetail[]>([])
  const [loadingDetails, setLoadingDetails] = useState(false)

  useEffect(() => {
    fetchDepartments()
    fetchSummaries()
  }, [period, selectedWeek, selectedMonth])

  const fetchDepartments = async () => {
    try {
      const response = await fetch("/api/admin/departments")
      if (response.ok) {
        const data = await response.json()
        setDepartments(Array.isArray(data) ? data : [])
      } else {
        setDepartments([])
      }
    } catch (error) {
      console.error("Error fetching departments:", error)
      setDepartments([])
    }
  }

  const fetchSummaries = async () => {
    setLoading(true)
    try {
      let url = `/api/admin/department-summaries?period=${period}`

      if (departmentId) {
        url += `&departmentId=${departmentId}`
      } else if (selectedDepartment !== "all") {
        url += `&departmentId=${selectedDepartment}`
      }

      if (period === "weekly" && selectedWeek) {
        url += `&week=${selectedWeek}`
      } else if (period === "monthly" && selectedMonth) {
        url += `&month=${selectedMonth}`
      }

      const response = await fetch(url)
      if (response.ok) {
        const data = await response.json()
        setSummaries(data.summaries)
        setDateRange({ start: data.startDate, end: data.endDate })
        setTotalStaff(data.totalStaff)
      }
    } catch (error) {
      console.error("Error fetching summaries:", error)
    } finally {
      setLoading(false)
    }
  }

  const selectedDepartmentName = useMemo(
    () => departments.find((d) => d.id === selectedDepartment)?.name,
    [departments, selectedDepartment],
  )

  const filteredSummaries = useMemo(() => {
    let filtered = [...summaries]

    // SMART LEAVE FILTERING: Exclude inactive staff on leave from analytics
    filtered = filtered.filter((staff) => {
      // Include only if staff is active
      if (!staff.isActive) {
        return false
      }

      // Exclude if currently on active leave
      if (staff.leaveStatus === "active" && staff.leaveStartDate && staff.leaveEndDate) {
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const leaveStart = new Date(staff.leaveStartDate)
        const leaveEnd = new Date(staff.leaveEndDate)

        // Exclude from analytics if within leave period
        if (today >= leaveStart && today <= leaveEnd) {
          return false
        }
      }

      return true
    })

    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(
        (s) =>
          s.name.toLowerCase().includes(query) ||
          s.email.toLowerCase().includes(query) ||
          s.employeeId.toLowerCase().includes(query) ||
          s.department.toLowerCase().includes(query),
      )
    }

    if (userRole === "admin" && selectedDepartment !== "all") {
      filtered = filtered.filter((s) => s.department === selectedDepartmentName)
    }

    return filtered
  }, [summaries, searchQuery, userRole, selectedDepartment, selectedDepartmentName])

  const fetchStaffDetails = async (staff: Summary) => {
    setSelectedStaff(staff)
    setLoadingDetails(true)

    try {
      const response = await fetch(
        `/api/admin/staff-attendance-details?userId=${staff.userId}&startDate=${dateRange.start}&endDate=${dateRange.end}`,
      )
      if (response.ok) {
        const data = await response.json()
        setStaffAttendanceDetails(data.records)
      }
    } catch (error) {
      console.error("Error fetching staff details:", error)
    } finally {
      setLoadingDetails(false)
    }
  }

  const clearFilters = () => {
    setSearchQuery("")
    setSelectedDepartment("all")
    setSelectedWeek("current")
    setSelectedMonth(new Date().toISOString().slice(0, 7))
  }

  const getWeekOptions = () => {
    const weeks = []
    const today = new Date()
    for (let i = 0; i < 8; i++) {
      const weekStart = new Date(today)
      weekStart.setDate(today.getDate() - today.getDay() - i * 7)
      const weekEnd = new Date(weekStart)
      weekEnd.setDate(weekStart.getDate() + 6)

      weeks.push({
        value: i === 0 ? "current" : weekStart.toISOString().split("T")[0],
        label:
          i === 0
            ? "Current Week"
            : i === 1
              ? "Last Week"
              : `${weekStart.toLocaleDateString()} - ${weekEnd.toLocaleDateString()}`,
      })
    }
    return weeks
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "excellent":
        return <Badge className="bg-green-500">Excellent</Badge>
      case "good":
        return <Badge className="bg-blue-500">Good</Badge>
      default:
        return <Badge className="bg-orange-500">Needs Attention</Badge>
    }
  }

  const exportToCSV = () => {
    const headers = [
      "Name",
      "Employee ID",
      "Department",
      "Days Worked",
      "Days Absent",
      "Total Hours",
      "On Time",
      "Late",
      "Attendance Rate",
      "Status",
    ]
    const rows = summaries.map((s) => [
      s.name,
      s.employeeId,
      s.department,
      s.daysWorked,
      s.daysAbsent,
      s.totalWorkHours,
      s.daysOnTime,
      s.daysLate,
      `${s.attendanceRate}%`,
      s.status,
    ])

    const csv = [headers, ...rows].map((row) => row.join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `department-summary-${period}-${new Date().toISOString().split("T")[0]}.csv`
    a.click()
  }

  const totalDaysWorked = filteredSummaries.reduce((sum, s) => sum + s.daysWorked, 0)
  const totalAbsences = filteredSummaries.reduce((sum, s) => sum + s.daysAbsent, 0)
  const avgAttendanceRate =
    filteredSummaries.length > 0
      ? (
          filteredSummaries.reduce((sum, s) => sum + Number.parseFloat(s.attendanceRate), 0) / filteredSummaries.length
        ).toFixed(1)
      : "0.0"

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Department Attendance Summaries</h1>
            <p className="text-muted-foreground">
              {dateRange.start &&
                `${new Date(dateRange.start).toLocaleDateString()} - ${new Date(dateRange.end).toLocaleDateString()}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Select value={period} onValueChange={(value: any) => setPeriod(value)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="yearly">Yearly</SelectItem>
            </SelectContent>
          </Select>

          <Button onClick={exportToCSV} variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters & Search</CardTitle>
          <CardDescription>Filter and search staff attendance records</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search staff..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            {userRole === "admin" && (
              <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
                <SelectTrigger>
                  <SelectValue placeholder="All Departments" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Departments</SelectItem>
                  {departments.map((dept) => (
                    <SelectItem key={dept.id} value={dept.id}>
                      {dept.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {period === "weekly" && (
              <Select value={selectedWeek} onValueChange={setSelectedWeek}>
                <SelectTrigger>
                  <SelectValue placeholder="Select Week" />
                </SelectTrigger>
                <SelectContent>
                  {getWeekOptions().map((week) => (
                    <SelectItem key={week.value} value={week.value}>
                      {week.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {period === "monthly" && (
              <Input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} />
            )}

            <Button variant="outline" onClick={clearFilters}>
              <X className="h-4 w-4 mr-2" />
              Clear Filters
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Staff</p>
                <p className="text-2xl font-bold">{totalStaff}</p>
              </div>
              <Users className="h-8 w-8 text-primary opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Avg Attendance</p>
                <p className="text-2xl font-bold">{avgAttendanceRate}%</p>
              </div>
              <TrendingUp className="h-8 w-8 text-green-500 opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Days Worked</p>
                <p className="text-2xl font-bold">{totalDaysWorked}</p>
              </div>
              <Calendar className="h-8 w-8 text-blue-500 opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Absences</p>
                <p className="text-2xl font-bold">{totalAbsences}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-orange-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Staff Attendance Details</CardTitle>
          <CardDescription>Click on any staff member to view detailed attendance records</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-12">Loading...</div>
          ) : filteredSummaries.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              {searchQuery || selectedDepartment !== "all"
                ? "No staff found matching your filters"
                : "No data available for this period"}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Employee ID</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead className="text-center">Days Worked</TableHead>
                  <TableHead className="text-center">Absent</TableHead>
                  <TableHead className="text-center">On Time</TableHead>
                  <TableHead className="text-center">Late</TableHead>
                  <TableHead className="text-center">Total Hours</TableHead>
                  <TableHead className="text-center">Attendance Rate</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSummaries.map((summary) => (
                  <TableRow
                    key={summary.userId}
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => fetchStaffDetails(summary)}
                  >
                    <TableCell className="font-medium">{summary.name}</TableCell>
                    <TableCell>{summary.employeeId}</TableCell>
                    <TableCell>{summary.department}</TableCell>
                    <TableCell className="text-center">{summary.daysWorked}</TableCell>
                    <TableCell className="text-center">
                      <span className={summary.daysAbsent > 0 ? "text-orange-600 font-semibold" : ""}>
                        {summary.daysAbsent}
                      </span>
                    </TableCell>
                    <TableCell className="text-center text-green-600">{summary.daysOnTime}</TableCell>
                    <TableCell className="text-center">
                      <span className={summary.daysLate > 0 ? "text-orange-600 font-semibold" : ""}>
                        {summary.daysLate}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">{summary.totalWorkHours}h</TableCell>
                    <TableCell className="text-center">{summary.attendanceRate}%</TableCell>
                    <TableCell>{getStatusBadge(summary.status)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedStaff} onOpenChange={(open) => !open && setSelectedStaff(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedStaff?.name} - Attendance Details</DialogTitle>
          </DialogHeader>

          {selectedStaff && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">Days Worked</p>
                      <p className="text-2xl font-bold">{selectedStaff.daysWorked}</p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">Total Hours</p>
                      <p className="text-2xl font-bold">{selectedStaff.totalWorkHours}h</p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">Attendance Rate</p>
                      <p className="text-2xl font-bold">{selectedStaff.attendanceRate}%</p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">Late Arrivals</p>
                      <p className="text-2xl font-bold text-orange-600">{selectedStaff.daysLate}</p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {loadingDetails ? (
                <div className="text-center py-8">Loading details...</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Check In</TableHead>
                      <TableHead>Check Out</TableHead>
                      <TableHead>Hours</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {staffAttendanceDetails.map((record, idx) => (
                      <TableRow key={idx}>
                        <TableCell>{new Date(record.date).toLocaleDateString()}</TableCell>
                        <TableCell>
                          {record.checkInTime ? new Date(record.checkInTime).toLocaleTimeString() : "-"}
                        </TableCell>
                        <TableCell>
                          {record.checkOutTime ? new Date(record.checkOutTime).toLocaleTimeString() : "-"}
                        </TableCell>
                        <TableCell>{record.workHours.toFixed(2)}h</TableCell>
                        <TableCell className="max-w-[200px] truncate">{record.location}</TableCell>
                        <TableCell>
                          {record.status === "present" ? (
                            <Badge className="bg-green-500">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Present
                            </Badge>
                          ) : record.status === "late" ? (
                            <Badge className="bg-orange-500">
                              <Clock className="h-3 w-3 mr-1" />
                              Late
                            </Badge>
                          ) : (
                            <Badge variant="secondary">
                              <XCircle className="h-3 w-3 mr-1" />
                              Absent
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              <div className="mt-2 text-xs text-gray-500 italic">Note: Google location name is shown when an off‑premises check‑in was used.</div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
