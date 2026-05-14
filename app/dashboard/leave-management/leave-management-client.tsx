"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Plus, Download, Loader2, Search, RefreshCw, Trash2, CheckCircle2, Clock, XCircle } from "lucide-react"
import { format, differenceInDays } from "date-fns"

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
  userFirstName: string | null
  userLastName: string | null
}

const statusColors: Record<string, { bg: string; text: string; icon: any }> = {
  pending: { bg: "bg-yellow-50", text: "text-yellow-700", icon: Clock },
  approved: { bg: "bg-green-50", text: "text-green-700", icon: CheckCircle2 },
  rejected: { bg: "bg-red-50", text: "text-red-700", icon: XCircle },
  hr_reviewed: { bg: "bg-blue-50", text: "text-blue-700", icon: Clock },
}

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
    // Simple CSV export
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
    approvals: Math.ceil(leaveRequests.filter(r => r.status === "pending").length / 2),
  }

  const filteredRequests = leaveRequests.filter(r => {
    const matchesSearch = !searchTerm || r.reason?.toLowerCase().includes(searchTerm.toLowerCase()) || r.leave_type?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = !filterStatus || r.status === filterStatus
    return matchesSearch && matchesStatus
  })

  return (
    <div className="space-y-6">
      {/* Green Leave Workspace Header */}
      <Card className="border-0 bg-gradient-to-r from-emerald-600 to-emerald-700 text-white">
        <CardContent className="pt-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">Leave Management</h2>
                <p className="text-emerald-100 mt-1">2025/2026 Leave Year · Quality Control Company Limited</p>
              </div>
              <Button variant="ghost" size="sm" className="text-white hover:bg-emerald-700" onClick={fetchLeaveRequests}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>

            {/* Workflow Badges */}
            <div className="flex gap-2 flex-wrap">
              <Badge className="bg-emerald-500/20 text-white border-emerald-300">1. Staff Applies</Badge>
              <Badge className="bg-emerald-500/20 text-white border-emerald-300">2. HOD Reviews</Badge>
              <Badge className="bg-emerald-500/20 text-white border-emerald-300">3. HR Leave Office Adjusts</Badge>
              <Badge className="bg-emerald-500/20 text-white border-emerald-300">4. HR Issues Memo</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Pending", value: stats.pending, color: "from-orange-500 to-orange-600" },
          { label: "Approved", value: stats.approved, color: "from-emerald-500 to-emerald-600" },
          { label: "Submitted", value: stats.submitted, color: "from-blue-500 to-blue-600" },
          { label: "Manager Approvals", value: stats.approvals, color: "from-purple-500 to-purple-600" },
        ].map((stat, i) => (
          <Card key={i} className={`bg-gradient-to-br ${stat.color} border-0 text-white`}>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-3xl font-bold">{stat.value}</div>
                <p className="text-sm mt-1 opacity-90">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Export Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Export Annual Leave Requests</CardTitle>
          <CardDescription>Download all staff annual leave requests for your department/region as an Excel file.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleExportExcel} className="w-full bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700">
            <Download className="h-4 w-4 mr-2" />
            Export to Excel
          </Button>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2">
        {["Request", "Apply", "HOD Review", "HR Leave Office", "HR Approvals", "All Requests"].map((action, i) => (
          <Button
            key={i}
            variant={i === 0 ? "default" : "outline"}
            className={i === 0 ? "bg-orange-500 hover:bg-orange-600" : ""}
          >
            {i === 0 && <Plus className="h-4 w-4 mr-2" />}
            {action}
            {[0, 4, 5].includes(i) && i === 4 && <Badge variant="secondary" className="ml-2">2</Badge>}
            {i === 5 && <Badge variant="secondary" className="ml-2">{leaveRequests.length}</Badge>}
          </Button>
        ))}
      </div>

      {/* Leave Requests List */}
      <div className="space-y-4">
        <div className="flex gap-2">
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
            className="px-4 py-2 rounded-md border border-input bg-background"
          >
            <option value="">All Status</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>

        {loading ? (
          <Card className="text-center py-12">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Loading leave requests...</p>
          </Card>
        ) : filteredRequests.length === 0 ? (
          <Card className="text-center py-12">
            <p className="text-muted-foreground font-medium">No leave requests found</p>
          </Card>
        ) : (
          filteredRequests.map((request) => {
            const days = differenceInDays(new Date(request.end_date), new Date(request.start_date)) + 1
            const colors = statusColors[request.status] || statusColors.pending
            const Icon = colors.icon

            return (
              <Card key={request.id} className={colors.bg}>
                <CardContent className="pt-6">
                  <div className="space-y-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-semibold text-lg">{request.leave_type || "Leave Request"}</h3>
                        <p className="text-sm text-muted-foreground mt-1">{request.reason}</p>
                      </div>
                      <Badge className={`${colors.text} ${colors.bg} border-0`}>
                        <Icon className="h-3 w-3 mr-1" />
                        {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-white/50 rounded p-3">
                        <p className="text-xs font-medium text-muted-foreground">START</p>
                        <p className="font-semibold">{format(new Date(request.start_date), "MMM d")}</p>
                      </div>
                      <div className="bg-white/50 rounded p-3">
                        <p className="text-xs font-medium text-muted-foreground">END</p>
                        <p className="font-semibold">{format(new Date(request.end_date), "MMM d")}</p>
                      </div>
                      <div className="bg-white/50 rounded p-3">
                        <p className="text-xs font-medium text-muted-foreground">DAYS</p>
                        <p className="font-semibold">{days}</p>
                      </div>
                    </div>

                    <div className="flex justify-between items-center pt-2 border-t">
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(request.created_at), "MMM d, yyyy HH:mm")}
                      </p>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDeleteRequest(request.id)}
                        disabled={isSubmitting}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })
        )}
      </div>
    </div>
  )
}
