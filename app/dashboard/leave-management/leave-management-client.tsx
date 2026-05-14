"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Plus, Download, Loader2, Search, RefreshCw, Trash2, CheckCircle2, Clock, XCircle, FileText, Users, Calendar, ChevronRight, AlertCircle, FileDown } from "lucide-react"
import { format, differenceInDays } from "date-fns"
import { LeaveRequestDialog } from "@/components/leave/leave-request-dialog"

interface LeaveRequest {
  id: string
  start_date: string
  end_date: string
  reason: string
  status: string
  created_at: string
  leave_type?: string
  user_id?: string
}

interface LeaveManagementClientProps {
  userId: string
  userRole: string
  userDepartment?: string | null
  userFirstName: string | null
  userLastName: string | null
  hasHodLinkage?: boolean
  inactivityDays?: number
  initialStaffRequests?: any[]
  initialManagerNotifications?: any[]
  initialApprovedStaffRequests?: any[]
}

const statusColors: Record<string, { bg: string; text: string; border: string; icon: any }> = {
  pending: { bg: "bg-yellow-50", text: "text-yellow-700", border: "border-l-yellow-500", icon: Clock },
  approved: { bg: "bg-green-50", text: "text-green-700", border: "border-l-green-500", icon: CheckCircle2 },
  rejected: { bg: "bg-red-50", text: "text-red-700", border: "border-l-red-500", icon: XCircle },
  hr_reviewed: { bg: "bg-blue-50", text: "text-blue-700", border: "border-l-blue-500", icon: Clock },
}

type ActiveView = "my_requests" | "apply" | "approved" | "deferments" | "recalls" | "approved_memos"

export function LeaveManagementClient({
  userId,
  userRole,
  userFirstName,
  userLastName,
}: LeaveManagementClientProps) {
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [filterStatus, setFilterStatus] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [activeView, setActiveView] = useState<ActiveView>("my_requests")

  useEffect(() => {
    fetchLeaveRequests()
  }, [userId])

  const fetchLeaveRequests = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/leave/requests?userId=${userId}`)
      const result = await response.json()
      if (result.success) {
        setLeaveRequests(result.data || [])
      }
    } catch (error) {
      console.error("[v0] Error fetching leave requests:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleLeaveSubmit = async (data: any) => {
    try {
      setIsSubmitting(true)
      const response = await fetch("/api/leave/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          startDate: data.startDate.toISOString().split("T")[0],
          endDate: data.endDate.toISOString().split("T")[0],
          reason: data.reason,
          leaveType: data.leaveType,
        }),
      })
      const result = await response.json()
      if (result.success) {
        setDialogOpen(false)
        await fetchLeaveRequests()
      }
    } catch (error) {
      console.error("[v0] Error submitting leave request:", error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteRequest = async (requestId: string) => {
    if (!confirm("Are you sure you want to delete this leave request?")) return

    try {
      setIsSubmitting(true)
      const response = await fetch(`/api/leave/requests?id=${requestId}`, {
        method: "DELETE",
      })
      const result = await response.json()
      if (result.success) {
        setLeaveRequests(leaveRequests.filter(r => r.id !== requestId))
      }
    } catch (error) {
      console.error("[v0] Error deleting request:", error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleExportExcel = () => {
    const headers = ["Leave Type", "Start Date", "End Date", "Reason", "Status", "Duration"]
    const rows = leaveRequests.map(r => [
      r.leave_type || "N/A",
      format(new Date(r.start_date), "MMM dd, yyyy"),
      format(new Date(r.end_date), "MMM dd, yyyy"),
      r.reason,
      r.status,
      `${differenceInDays(new Date(r.end_date), new Date(r.start_date)) + 1} days`,
    ])

    const csv = [headers, ...rows].map(row => row.join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `leave-requests-${format(new Date(), "yyyy-MM-dd")}.csv`
    a.click()
  }

  const stats = {
    pending: leaveRequests.filter(r => r.status === "pending").length,
    approved: leaveRequests.filter(r => r.status === "approved").length,
    submitted: leaveRequests.length,
    approvals: leaveRequests.filter(r => r.status === "hr_reviewed" || r.status === "pending").length,
  }

  const filteredRequests = leaveRequests.filter(r => {
    const matchesSearch = !searchTerm || r.reason?.toLowerCase().includes(searchTerm.toLowerCase()) || r.leave_type?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = !filterStatus || r.status === filterStatus
    return matchesSearch && matchesStatus
  })

  const staffName = `${userFirstName || ""} ${userLastName || ""}`.trim() || "Staff"

  return (
    <div className="space-y-6">
      {/* Leave Request Dialog */}
      <LeaveRequestDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        staffName={staffName}
        onSubmit={handleLeaveSubmit}
      />

      {/* LEAVE WORKSPACE Header - Dark gradient like reference */}
      <Card className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border-0 text-white shadow-xl overflow-hidden">
        <CardContent className="p-6">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
            <div className="space-y-4">
              {/* LEAVE WORKSPACE Badge */}
              <div className="flex items-center gap-2">
                <div className="bg-blue-500/20 p-2 rounded-lg">
                  <Calendar className="h-5 w-5 text-blue-400" />
                </div>
                <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30 text-xs uppercase tracking-wider">
                  Leave Workspace
                </Badge>
              </div>

              {/* Title & Description */}
              <div>
                <h2 className="text-2xl font-bold">Leave Management</h2>
                <p className="text-slate-400 text-sm mt-1">
                  Review leave activity, track submissions, and move quickly between personal requests and approvals.
                </p>
              </div>

              {/* Role Badges */}
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="bg-slate-700/50 text-slate-300 border-slate-600">
                  Role: {userRole || "Staff"}
                </Badge>
                <Badge variant="outline" className="bg-slate-700/50 text-slate-300 border-slate-600">
                  Department Linked
                </Badge>
                <Badge variant="outline" className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30">
                  Self-service Enabled
                </Badge>
              </div>
            </div>

            {/* Stats Grid - Right side */}
            <div className="grid grid-cols-2 gap-3 lg:w-80">
              <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-slate-400 uppercase tracking-wider">Pending</p>
                  <Clock className="h-4 w-4 text-yellow-400" />
                </div>
                <p className="text-3xl font-bold mt-1">{stats.pending}</p>
                <p className="text-xs text-slate-500">Awaiting decision</p>
              </div>
              <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-slate-400 uppercase tracking-wider">Approved</p>
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                </div>
                <p className="text-3xl font-bold mt-1">{stats.approved}</p>
                <p className="text-xs text-slate-500">Confirmed leave</p>
              </div>
              <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-slate-400 uppercase tracking-wider">Submitted</p>
                  <FileText className="h-4 w-4 text-blue-400" />
                </div>
                <p className="text-3xl font-bold mt-1">{stats.submitted}</p>
                <p className="text-xs text-slate-500">My requests</p>
              </div>
              <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-slate-400 uppercase tracking-wider">Approvals</p>
                  <Users className="h-4 w-4 text-purple-400" />
                </div>
                <p className="text-3xl font-bold mt-1">{stats.approvals}</p>
                <p className="text-xs text-slate-500">Manager queue</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Export Section */}
      <Card className="bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-amber-100 p-2 rounded-lg">
                <Download className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <h3 className="font-semibold text-amber-900">Export Annual Leave Requests</h3>
                <p className="text-sm text-amber-700">Download all staff annual leave requests for your department/region as an Excel file.</p>
              </div>
            </div>
            <Button 
              onClick={handleExportExcel} 
              className="bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white"
            >
              <FileDown className="h-4 w-4 mr-2" />
              Export to Excel
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Leave Application Actions - Like reference design */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-slate-600" />
            <CardTitle className="text-lg">Leave Application Actions</CardTitle>
          </div>
          <CardDescription>Manage your leave requests and submissions.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button 
              variant={activeView === "my_requests" ? "default" : "outline"}
              onClick={() => setActiveView("my_requests")}
              className={activeView === "my_requests" ? "bg-blue-600 hover:bg-blue-700" : ""}
            >
              <FileText className="h-4 w-4 mr-2" />
              My Requests ({stats.submitted})
            </Button>
            <Button 
              onClick={() => setDialogOpen(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <Plus className="h-4 w-4 mr-2" />
              Apply for Leave
            </Button>
            <Button 
              variant={activeView === "approved" ? "default" : "outline"}
              onClick={() => setActiveView("approved")}
              className={activeView === "approved" ? "bg-green-600 hover:bg-green-700" : ""}
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Approved ({stats.approved})
            </Button>
            <Button variant="outline" onClick={() => setActiveView("deferments")}>
              <Clock className="h-4 w-4 mr-2" />
              Deferments
            </Button>
            <Button variant="outline" onClick={() => setActiveView("recalls")}>
              <AlertCircle className="h-4 w-4 mr-2" />
              Recalls
            </Button>
            <Button variant="outline" onClick={() => setActiveView("approved_memos")}>
              <FileDown className="h-4 w-4 mr-2" />
              Approved Memos
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Leave Requests List */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle>
                {activeView === "my_requests" && "My Leave Requests"}
                {activeView === "approved" && "Approved Leave Requests"}
                {activeView === "deferments" && "Leave Deferments"}
                {activeView === "recalls" && "Leave Recalls"}
                {activeView === "approved_memos" && "Approved Memos"}
              </CardTitle>
              <CardDescription>
                {activeView === "my_requests" && "All your submitted leave requests"}
                {activeView === "approved" && "Your approved leave requests"}
              </CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={fetchLeaveRequests}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search and Filter */}
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search leaves..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <select
              value={filterStatus || ""}
              onChange={(e) => setFilterStatus(e.target.value || null)}
              className="px-4 py-2 rounded-md border border-input bg-background text-sm"
            >
              <option value="">All Status</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>

          {/* Requests List */}
          {loading ? (
            <div className="text-center py-16">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Loading leave requests...</p>
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="text-center py-16 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200">
              <Calendar className="h-12 w-12 mx-auto text-slate-300 mb-4" />
              <p className="text-slate-600 font-medium">No leave requests yet</p>
              <p className="text-sm text-slate-500 mt-1 mb-4">{"You haven't submitted any leave requests. Click the button below to apply for leave."}</p>
              <Button onClick={() => setDialogOpen(true)} className="bg-emerald-600 hover:bg-emerald-700">
                <Plus className="h-4 w-4 mr-2" />
                Apply for Leave
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredRequests.map((request) => {
                const days = differenceInDays(new Date(request.end_date), new Date(request.start_date)) + 1
                const colors = statusColors[request.status] || statusColors.pending
                const Icon = colors.icon

                return (
                  <Card key={request.id} className={`${colors.bg} border-l-4 ${colors.border} hover:shadow-md transition-shadow`}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 space-y-3">
                          <div className="flex items-center gap-3">
                            <h3 className="font-semibold text-lg">{request.leave_type || "Leave Request"}</h3>
                            <Badge className={`${colors.bg} ${colors.text} border-0`}>
                              <Icon className="h-3 w-3 mr-1" />
                              {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">{request.reason}</p>

                          {/* Date Grid */}
                          <div className="grid grid-cols-3 gap-3">
                            <div className="bg-white/70 rounded-lg p-3 text-center">
                              <p className="text-xs font-medium text-muted-foreground uppercase">Start</p>
                              <p className="font-semibold">{format(new Date(request.start_date), "MMM d, yyyy")}</p>
                            </div>
                            <div className="bg-white/70 rounded-lg p-3 text-center">
                              <p className="text-xs font-medium text-muted-foreground uppercase">End</p>
                              <p className="font-semibold">{format(new Date(request.end_date), "MMM d, yyyy")}</p>
                            </div>
                            <div className="bg-white/70 rounded-lg p-3 text-center">
                              <p className="text-xs font-medium text-muted-foreground uppercase">Duration</p>
                              <p className="font-semibold">{days} day{days !== 1 ? "s" : ""}</p>
                            </div>
                          </div>

                          <div className="flex items-center justify-between pt-2 border-t border-slate-200/50">
                            <p className="text-xs text-muted-foreground">
                              Submitted {format(new Date(request.created_at), "MMM d, yyyy 'at' HH:mm")}
                            </p>
                            {request.status === "approved" && (
                              <Button size="sm" variant="outline" className="text-emerald-600 border-emerald-300 hover:bg-emerald-50">
                                <FileDown className="h-4 w-4 mr-1" />
                                Download Memo
                              </Button>
                            )}
                            {request.status === "pending" && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleDeleteRequest(request.id)}
                                disabled={isSubmitting}
                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              >
                                <Trash2 className="h-4 w-4 mr-1" />
                                Cancel
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
