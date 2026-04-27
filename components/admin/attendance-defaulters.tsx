"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AlertCircle, Send, Users, Calendar, MapPin, ChevronLeft, ChevronRight } from "lucide-react"
import Image from "next/image"

interface DefaultingStaff {
  id: string
  full_name: string
  email: string
  department_name: string
  location_name: string
  role: string
  last_check_in: string | null
  last_check_out: string | null
  days_missed: number
  issue_type: "no_check_in" | "no_check_out" | "both"
}

interface AttendanceDefaultersProps {
  userRole: string
  departmentId?: string
}

export function AttendanceDefaulters({ userRole, departmentId }: AttendanceDefaultersProps) {
  const [loading, setLoading] = useState(true)
  const [defaulters, setDefaulters] = useState<DefaultingStaff[]>([])
  const [selectedStaff, setSelectedStaff] = useState<string[]>([])
  const [warningMessage, setWarningMessage] = useState("")
  const [sendingWarning, setSendingWarning] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [timeframe, setTimeframe] = useState<"daily" | "weekly">("daily")
  const [departmentFilter, setDepartmentFilter] = useState<string>("all")
  const [locationFilter, setLocationFilter] = useState<string>("all")
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([])
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([])
  const [showWarningDialog, setShowWarningDialog] = useState(false)
  const [pageSize, setPageSize] = useState<100 | 200 | 500>(100)
  const [checkInPage, setCheckInPage] = useState(1)
  const [checkOutPage, setCheckOutPage] = useState(1)

  useEffect(() => {
    fetchDefaulters()
    fetchFilters()
    setCheckInPage(1)
    setCheckOutPage(1)
  }, [timeframe, departmentFilter, locationFilter])

  useEffect(() => {
    setCheckInPage(1)
    setCheckOutPage(1)
  }, [pageSize])

  const fetchDefaulters = async () => {
    setLoading(true)
    setError(null) // Clear previous errors
    console.log("[v0] Fetching defaulters with params:", { timeframe, departmentFilter, locationFilter })
    try {
      const params = new URLSearchParams({
        timeframe,
        ...(departmentFilter !== "all" && { department_id: departmentFilter }),
        ...(locationFilter !== "all" && { location_id: locationFilter }),
      })

      console.log("[v0] Fetching URL:", `/api/admin/attendance-defaulters?${params}`)
      const response = await fetch(`/api/admin/attendance-defaulters?${params}`)
      console.log("[v0] Response status:", response.status)

      if (!response.ok) {
        const errorText = await response.text()
        console.error("[v0] Error response:", errorText)
        throw new Error(`Failed to fetch defaulters: ${errorText}`)
      }

      const data = await response.json()
      console.log("[v0] Defaulters data:", data)
      setDefaulters(data.defaulters || [])
    } catch (err) {
      console.error("[v0] Fetch error:", err)
      setError(err instanceof Error ? err.message : "Failed to load defaulters")
    } finally {
      setLoading(false)
    }
  }

  const fetchFilters = async () => {
    console.log("[v0] Fetching filters (departments and locations)")
    try {
      const [deptRes, locRes] = await Promise.all([fetch("/api/admin/departments"), fetch("/api/admin/locations")])

      console.log("[v0] Departments API status:", deptRes.status)
      console.log("[v0] Locations API status:", locRes.status)

      if (deptRes.ok) {
        const deptData = await deptRes.json()
        console.log("[v0] Departments data:", deptData)
        setDepartments(Array.isArray(deptData) ? deptData : deptData.data || deptData.departments || [])
      } else {
        console.error("[v0] Departments API error:", await deptRes.text())
      }

      if (locRes.ok) {
        const locData = await locRes.json()
        console.log("[v0] Locations data:", locData)
        setLocations(Array.isArray(locData) ? locData : locData.data || locData.locations || [])
      } else {
        console.error("[v0] Locations API error:", await locRes.text())
      }
    } catch (err) {
      console.error("[v0] Error fetching filters:", err)
    }
  }

  const handleSendWarning = async () => {
    if (selectedStaff.length === 0) {
      setError("Please select at least one staff member")
      return
    }

    if (!warningMessage.trim()) {
      setError("Please enter a warning message")
      return
    }

    console.log("[v0] Sending warnings to:", selectedStaff.length, "staff members")
    console.log("[v0] Warning message length:", warningMessage.length)

    setSendingWarning(true)
    setError(null)

    try {
      const response = await fetch("/api/admin/send-warnings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient_ids: selectedStaff,
          message: warningMessage,
          warning_type: timeframe === "daily" ? "daily_absence" : "weekly_absence",
        }),
      })

      console.log("[v0] Send warnings response status:", response.status)

      if (!response.ok) {
        let errorMsg = "Failed to send warnings"
        const contentType = response.headers.get("content-type") || ""
        if (contentType.includes("application/json")) {
          try {
            const errBody = await response.json()
            errorMsg = errBody?.error || JSON.stringify(errBody)
          } catch (e) {
            errorMsg = await response.text()
          }
        } else {
          errorMsg = await response.text()
        }
        console.error("[v0] Send warnings error:", errorMsg)
        throw new Error(errorMsg)
      }

      const data = await response.json()
      console.log("[v0] Warnings sent successfully:", data)
      setSuccess(`Successfully sent warning to ${data.sent} staff member(s)`)
      setSelectedStaff([])
      setWarningMessage("")
      setShowWarningDialog(false)
      fetchDefaulters()
    } catch (err) {
      console.error("[v0] Send warning error:", err)
      setError(err instanceof Error ? err.message : "Failed to send warnings")
    } finally {
      setSendingWarning(false)
    }
  }

  const toggleStaffSelection = (staffId: string) => {
    setSelectedStaff((prev) => (prev.includes(staffId) ? prev.filter((id) => id !== staffId) : [...prev, staffId]))
  }

  const selectAll = () => {
    setSelectedStaff(defaulters.map((s) => s.id))
  }

  const clearSelection = () => {
    setSelectedStaff([])
  }

  const getDefaultMessage = () => {
    const senderLabel = userRole === "admin" ? "Management of QCC" : "Department Head"
    if (timeframe === "daily") {
      return `Dear [STAFF_NAME],

This is a formal notification from ${senderLabel} regarding your attendance today. Our records indicate that you have not checked in/out of the system.

Please ensure you follow the proper check-in and check-out procedures daily. Regular attendance monitoring is essential for operational efficiency.

If you were on authorized leave or had a valid reason for absence, please contact your supervisor immediately.

Best regards,
${senderLabel}`
    } else {
      return `Dear [STAFF_NAME],

This is a formal notification from ${senderLabel} regarding your attendance this week. Our records indicate that you have failed to check in/out on multiple occasions.

This is a serious matter that requires immediate attention. Please ensure you adhere to the company's attendance policy and use the check-in/check-out system daily.

Repeated violations may result in disciplinary action. If there were extenuating circumstances, please report to your supervisor or HR department.

Best regards,
${senderLabel}`
    }
  }

  const noCheckIn = defaulters.filter((d) => d.issue_type === "no_check_in" || d.issue_type === "both")
  const noCheckOut = defaulters.filter((d) => d.issue_type === "no_check_out" || d.issue_type === "both")

  const checkInTotalPages = Math.max(1, Math.ceil(noCheckIn.length / pageSize))
  const checkOutTotalPages = Math.max(1, Math.ceil(noCheckOut.length / pageSize))
  const paginatedCheckIn = noCheckIn.slice((checkInPage - 1) * pageSize, checkInPage * pageSize)
  const paginatedCheckOut = noCheckOut.slice((checkOutPage - 1) * pageSize, checkOutPage * pageSize)

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Image src="/images/qcc-logo.png" alt="QCC Logo" width={40} height={40} className="rounded-full" />
            <div>
              <CardTitle>Attendance Defaulters Management</CardTitle>
              <CardDescription>Monitor and send notifications to staff with attendance issues</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Select value={timeframe} onValueChange={(v: any) => setTimeframe(v)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Today</SelectItem>
                <SelectItem value="weekly">This Week</SelectItem>
              </SelectContent>
            </Select>

            <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
              <SelectTrigger className="w-[180px]">
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

            <Select value={locationFilter} onValueChange={setLocationFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Locations" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Locations</SelectItem>
                {locations.map((loc) => (
                  <SelectItem key={loc.id} value={loc.id}>
                    {loc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v) as 100 | 200 | 500)}>
              <SelectTrigger className="w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="100">100 per page</SelectItem>
                <SelectItem value="200">200 per page</SelectItem>
                <SelectItem value="500">500 per page</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {success && (
            <Alert>
              <AlertDescription className="text-green-600">{success}</AlertDescription>
            </Alert>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={selectAll} disabled={defaulters.length === 0}>
                Select All ({defaulters.length})
              </Button>
              <Button size="sm" variant="outline" onClick={() => setSelectedStaff(noCheckIn.map(s => s.id))} disabled={noCheckIn.length === 0}>
                Select All Check‑In ({noCheckIn.length})
              </Button>
              <Button size="sm" variant="outline" onClick={() => setSelectedStaff(noCheckOut.map(s => s.id))} disabled={noCheckOut.length === 0}>
                Select All Check‑Out ({noCheckOut.length})
              </Button>
              <Button size="sm" variant="outline" onClick={clearSelection} disabled={selectedStaff.length === 0}>
                Clear ({selectedStaff.length})
              </Button>
            </div>
            <Button
              onClick={() => {
                setWarningMessage(getDefaultMessage())
                setShowWarningDialog(true)
              }}
              disabled={selectedStaff.length === 0}
            >
              <Send className="h-4 w-4 mr-2" />
              Send Warning ({selectedStaff.length})
            </Button>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="no_check_in" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="no_check_in">No Check-In ({noCheckIn.length})</TabsTrigger>
          <TabsTrigger value="no_check_out">No Check-Out ({noCheckOut.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="no_check_in" className="space-y-2">
          {noCheckIn.length > 0 && (
            <div className="flex items-center justify-between text-sm text-muted-foreground px-1">
              <span>
                Showing {(checkInPage - 1) * pageSize + 1}–{Math.min(checkInPage * pageSize, noCheckIn.length)} of {noCheckIn.length} staff
              </span>
              <div className="flex items-center gap-1">
                <Button
                  size="icon"
                  variant="outline"
                  className="h-8 w-8"
                  disabled={checkInPage === 1}
                  onClick={() => setCheckInPage((p) => p - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="px-2 min-w-[60px] text-center">
                  {checkInPage} / {checkInTotalPages}
                </span>
                <Button
                  size="icon"
                  variant="outline"
                  className="h-8 w-8"
                  disabled={checkInPage === checkInTotalPages}
                  onClick={() => setCheckInPage((p) => p + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
          {noCheckIn.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                No staff with check-in issues found
              </CardContent>
            </Card>
          ) : (
            paginatedCheckIn.map((staff) => (
              <Card key={staff.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    <Checkbox
                      checked={selectedStaff.includes(staff.id)}
                      onCheckedChange={() => toggleStaffSelection(staff.id)}
                    />
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="font-semibold">{staff.full_name}</h4>
                        <Badge variant="destructive">{staff.days_missed} day(s) missed</Badge>
                      </div>
                      <div className="text-sm text-muted-foreground space-y-1">
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4" />
                          {staff.department_name} - {staff.role}
                        </div>
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4" />
                          {staff.location_name}
                        </div>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          Last check-in:{" "}
                          {staff.last_check_in ? new Date(staff.last_check_in).toLocaleDateString() : "Never"}
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
          {checkInTotalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <Button
                size="sm"
                variant="outline"
                disabled={checkInPage === 1}
                onClick={() => setCheckInPage((p) => p - 1)}
              >
                <ChevronLeft className="h-4 w-4 mr-1" /> Previous
              </Button>
              <span className="text-sm text-muted-foreground px-2">
                Page {checkInPage} of {checkInTotalPages}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={checkInPage === checkInTotalPages}
                onClick={() => setCheckInPage((p) => p + 1)}
              >
                Next <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          )}
        </TabsContent>

        <TabsContent value="no_check_out" className="space-y-2">
          {noCheckOut.length > 0 && (
            <div className="flex items-center justify-between text-sm text-muted-foreground px-1">
              <span>
                Showing {(checkOutPage - 1) * pageSize + 1}–{Math.min(checkOutPage * pageSize, noCheckOut.length)} of {noCheckOut.length} staff
              </span>
              <div className="flex items-center gap-1">
                <Button
                  size="icon"
                  variant="outline"
                  className="h-8 w-8"
                  disabled={checkOutPage === 1}
                  onClick={() => setCheckOutPage((p) => p - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="px-2 min-w-[60px] text-center">
                  {checkOutPage} / {checkOutTotalPages}
                </span>
                <Button
                  size="icon"
                  variant="outline"
                  className="h-8 w-8"
                  disabled={checkOutPage === checkOutTotalPages}
                  onClick={() => setCheckOutPage((p) => p + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
          {noCheckOut.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                No staff with check-out issues found
              </CardContent>
            </Card>
          ) : (
            paginatedCheckOut.map((staff) => (
              <Card key={staff.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    <Checkbox
                      checked={selectedStaff.includes(staff.id)}
                      onCheckedChange={() => toggleStaffSelection(staff.id)}
                    />
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="font-semibold">{staff.full_name}</h4>
                        <Badge variant="destructive">{staff.days_missed} day(s) missed</Badge>
                      </div>
                      <div className="text-sm text-muted-foreground space-y-1">
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4" />
                          {staff.department_name} - {staff.role}
                        </div>
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4" />
                          {staff.location_name}
                        </div>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          Last check-out:{" "}
                          {staff.last_check_out ? new Date(staff.last_check_out).toLocaleDateString() : "Never"}
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
          {checkOutTotalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <Button
                size="sm"
                variant="outline"
                disabled={checkOutPage === 1}
                onClick={() => setCheckOutPage((p) => p - 1)}
              >
                <ChevronLeft className="h-4 w-4 mr-1" /> Previous
              </Button>
              <span className="text-sm text-muted-foreground px-2">
                Page {checkOutPage} of {checkOutTotalPages}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={checkOutPage === checkOutTotalPages}
                onClick={() => setCheckOutPage((p) => p + 1)}
              >
                Next <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={showWarningDialog} onOpenChange={setShowWarningDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <div className="flex items-center gap-2 mb-2">
              <Image src="/images/qcc-logo.png" alt="QCC Logo" width={40} height={40} className="rounded-full" />
              <DialogTitle>Send Formal Warning</DialogTitle>
            </div>
            <DialogDescription>
              Compose a formal notification to {selectedStaff.length} staff member(s) regarding attendance issues. The
              message will be from {userRole === "admin" ? "Management of QCC" : "Department Head"}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              value={warningMessage}
              onChange={(e) => setWarningMessage(e.target.value)}
              rows={12}
              className="font-mono text-sm"
              placeholder="Enter warning message..."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowWarningDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSendWarning} disabled={sendingWarning}>
              {sendingWarning ? "Sending..." : "Send Warning"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
