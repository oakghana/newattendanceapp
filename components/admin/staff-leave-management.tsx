"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Calendar, Loader2, AlertCircle, CheckCircle2 } from "lucide-react"
import { format } from "date-fns"
import { cn } from "@/lib/utils"
import { toast } from "@/hooks/use-toast"

const authenticatedFetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
  return fetch(input, {
    ...init,
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      "Cache-Control": "no-store",
      ...(init.headers || {}),
    },
  })
}

interface StaffMember {
  id: string
  first_name: string
  last_name: string
  email: string
  leave_status: "active" | "on_leave" | "sick_leave"
  leave_start_date: string | null
  leave_end_date: string | null
  leave_reason: string | null
  department: string
  role: string
}

export function StaffLeaveManagement() {
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [leaveStatus, setLeaveStatus] = useState<"active" | "on_leave" | "sick_leave">("active")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [reason, setReason] = useState("")

  // Check user permissions and fetch staff
  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      // First check if user is authorized to access this
      const authResponse = await authenticatedFetch("/api/auth/current-user")
      if (!authResponse.ok) {
        toast({
          title: "Error",
          description: "User not authenticated",
          variant: "destructive",
        })
        setLoading(false)
        return
      }

      const { user } = await authResponse.json()
      
      // Check if user is admin or god
      const userProfileResponse = await authenticatedFetch(`/api/admin/staff/${user.id}`)
      if (!userProfileResponse.ok) {
        toast({
          title: "Access Denied",
          description: "Only admins and god users can manage staff leave status",
          variant: "destructive",
        })
        setLoading(false)
        return
      }

      const { data: userProfile } = await userProfileResponse.json()
      if (!userProfile || (userProfile.role !== "admin" && userProfile.role !== "god")) {
        toast({
          title: "Access Denied",
          description: "Only admins and god users can manage staff leave status",
          variant: "destructive",
        })
        setLoading(false)
        return
      }

      setUserRole(userProfile.role)

      // Fetch all staff members
      const staffResponse = await authenticatedFetch("/api/admin/staff?limit=2000")
      if (!staffResponse.ok) {
        throw new Error("Failed to fetch staff")
      }

      const staffData = await staffResponse.json()
      const formattedStaff = (staffData.data || []).map((s: any) => ({
        id: s.id,
        first_name: s.first_name,
        last_name: s.last_name,
        email: s.email,
        leave_status: s.leave_status || "active",
        leave_start_date: s.leave_start_date,
        leave_end_date: s.leave_end_date,
        leave_reason: s.leave_reason,
        department: s.department_name || "Unknown",
        role: s.role,
      }))

      setStaff(formattedStaff)
    } catch (error) {
      console.error("[v0] Error fetching data:", error)
      toast({
        title: "Error",
        description: "An error occurred while loading data",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleOpenDialog = (member: StaffMember) => {
    setSelectedStaff(member)
    setLeaveStatus(member.leave_status)
    setStartDate(member.leave_start_date ? format(new Date(member.leave_start_date), "yyyy-MM-dd") : "")
    setEndDate(member.leave_end_date ? format(new Date(member.leave_end_date), "yyyy-MM-dd") : "")
    setReason(member.leave_reason || "")
    setIsDialogOpen(true)
  }

  const handleSubmit = async () => {
    if (!selectedStaff) return

    if (leaveStatus !== "active" && (!startDate || !endDate)) {
      toast({
        title: "Validation Error",
        description: "Please provide start and end dates for leave",
        variant: "destructive",
      })
      return
    }

    setIsSubmitting(true)
    try {
      const response = await fetch("/api/attendance/leave-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target_user_id: selectedStaff.id,
          leave_status: leaveStatus,
          leave_start_date: leaveStatus === "active" ? null : startDate,
          leave_end_date: leaveStatus === "active" ? null : endDate,
          leave_reason: reason,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to update leave status")
      }

      const result = await response.json()
      
      toast({
        title: "Success",
        description: result.message || "Leave status updated successfully",
      })

      setIsDialogOpen(false)
      setSelectedStaff(null)
      await fetchData()
    } catch (error) {
      console.error("[v0] Error updating leave status:", error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update leave status",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const filteredStaff = staff.filter(
    (member) =>
      member.first_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      member.last_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      member.email.toLowerCase().includes(searchTerm.toLowerCase()),
  )

  const stats = {
    total: staff.length,
    active: staff.filter((s) => s.leave_status === "active").length,
    onLeave: staff.filter((s) => s.leave_status === "on_leave").length,
    sickLeave: staff.filter((s) => s.leave_status === "sick_leave").length,
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-100 text-green-800"
      case "on_leave":
        return "bg-yellow-100 text-yellow-800"
      case "sick_leave":
        return "bg-red-100 text-red-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "active":
        return <CheckCircle2 className="w-4 h-4" />
      case "on_leave":
        return <Calendar className="w-4 h-4" />
      case "sick_leave":
        return <AlertCircle className="w-4 h-4" />
      default:
        return null
    }
  }

  if (!userRole) {
    return (
      <Alert className="border-red-200 bg-red-50">
        <AlertCircle className="h-4 w-4 text-red-600" />
        <AlertDescription className="text-red-800">
          You do not have permission to access this feature. Only admins and god users can manage staff leave status.
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Staff Leave Management</h2>
        <p className="text-muted-foreground mt-2">
          Manage staff leave status. All staff default to "at post". Only you can mark staff as on leave or sick leave.
        </p>
      </div>

      {/* Statistics */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Total Staff</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">At Post</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.active}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">On Leave</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{stats.onLeave}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Sick Leave</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.sickLeave}</div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2">
        <Input
          placeholder="Search by name or email..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="max-w-md"
        />
      </div>

      {/* Staff List */}
      {loading ? (
        <Card>
          <CardContent className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin" />
          </CardContent>
        </Card>
      ) : filteredStaff.length === 0 ? (
        <Card>
          <CardContent className="text-center py-8 text-muted-foreground">
            No staff members found
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredStaff.map((member) => (
            <Card key={member.id}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <h3 className="font-semibold">
                      {member.first_name} {member.last_name}
                    </h3>
                    <p className="text-sm text-muted-foreground">{member.email}</p>
                    <p className="text-sm text-muted-foreground">{member.department}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <Badge className={cn("gap-1", getStatusColor(member.leave_status))}>
                        {getStatusIcon(member.leave_status)}
                        {member.leave_status === "active"
                          ? "At Post"
                          : member.leave_status === "on_leave"
                            ? "On Leave"
                            : "Sick Leave"}
                      </Badge>
                    </div>
                    <Dialog open={isDialogOpen && selectedStaff?.id === member.id} onOpenChange={setIsDialogOpen}>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm" onClick={() => handleOpenDialog(member)}>
                          Update
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Update Leave Status</DialogTitle>
                          <DialogDescription>
                            Update leave status for {member.first_name} {member.last_name}
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div>
                            <Label>Leave Status</Label>
                            <Select value={leaveStatus} onValueChange={(value) => setLeaveStatus(value as any)}>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="active">At Post</SelectItem>
                                <SelectItem value="on_leave">On Leave</SelectItem>
                                <SelectItem value="sick_leave">Sick Leave</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          {leaveStatus !== "active" && (
                            <>
                              <div>
                                <Label>Start Date</Label>
                                <Input
                                  type="date"
                                  value={startDate}
                                  onChange={(e) => setStartDate(e.target.value)}
                                />
                              </div>
                              <div>
                                <Label>End Date</Label>
                                <Input
                                  type="date"
                                  value={endDate}
                                  onChange={(e) => setEndDate(e.target.value)}
                                />
                              </div>
                              <div>
                                <Label>Reason</Label>
                                <Textarea
                                  value={reason}
                                  onChange={(e) => setReason(e.target.value)}
                                  placeholder="Provide reason for leave..."
                                />
                              </div>
                            </>
                          )}
                        </div>
                        <DialogFooter>
                          <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                            Cancel
                          </Button>
                          <Button onClick={handleSubmit} disabled={isSubmitting}>
                            {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Update Status
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
