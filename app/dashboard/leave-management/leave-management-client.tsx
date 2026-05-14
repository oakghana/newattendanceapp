"use client"

import { useState, useEffect } from "react"
import { createClient } from "@supabase/supabase-js"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { 
  Calendar, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  Loader2, 
  Search, 
  RefreshCw,
  Download,
  FileText,
  Plus,
  ChevronRight,
  ClipboardList,
  ArrowRight,
  Sparkles
} from "lucide-react"
import { format, differenceInDays } from "date-fns"
import { LeaveRequestDialog } from "@/components/leave/leave-request-dialog"

interface LeaveManagementClientProps {
  userId: string
  userRole: string
  userDepartment: string | null
  userFirstName: string | null
  userLastName: string | null
  hasHodLinkage: boolean
  inactivityDays: number
  initialStaffRequests?: any[]
  initialManagerNotifications?: any[]
  initialApprovedStaffRequests?: any[]
}

interface LeaveRequest {
  id: string
  start_date: string
  end_date: string
  reason: string
  status: string
  created_at: string
  leave_type?: string
  user_name?: string
  department?: string
  location?: string
}

const getStatusBadge = (status: string) => {
  const statusMap: Record<string, { label: string; className: string }> = {
    pending: { label: "Pending", className: "bg-yellow-500 text-white" },
    approved: { label: "Approved", className: "bg-green-600 text-white" },
    hr_approved: { label: "Hr Approved", className: "bg-green-600 text-white" },
    rejected: { label: "Rejected", className: "bg-red-500 text-white" },
    hr_reviewed: { label: "HR Office Reviewed — Awaiting HR Approval", className: "bg-teal-600 text-white text-xs" },
    hod_approved: { label: "HOD Approved", className: "bg-blue-500 text-white" },
  }
  return statusMap[status.toLowerCase()] || { label: status, className: "bg-gray-500 text-white" }
}

export function LeaveManagementClient({
  userId,
  userRole,
  userFirstName,
  userLastName,
  userDepartment,
}: LeaveManagementClientProps) {
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([])
  const [allLeaveRequests, setAllLeaveRequests] = useState<LeaveRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [activeTab, setActiveTab] = useState("my-requests")
  const [searchTerm, setSearchTerm] = useState("")

  const isManager = ["department_head", "regional_manager", "hr_leave_office", "director_hr", "admin"].includes(
    userRole?.toLowerCase().replace(/[-\s]+/g, "_") || ""
  )

  useEffect(() => {
    fetchLeaveRequests()
    if (isManager) {
      fetchAllLeaveRequests()
    }
  }, [userId])

  const fetchLeaveRequests = async () => {
    try {
      setLoading(true)
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

      if (!supabaseUrl || !supabaseAnonKey) return

      const supabase = createClient(supabaseUrl, supabaseAnonKey)

      const { data, error } = await supabase
        .from("leave_requests")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })

      if (error) {
        console.error("[v0] Error fetching leave requests:", error)
        return
      }

      setLeaveRequests(data || [])
    } catch (error) {
      console.error("[v0] Unexpected error:", error)
    } finally {
      setLoading(false)
    }
  }

  const fetchAllLeaveRequests = async () => {
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

      if (!supabaseUrl || !supabaseAnonKey) return

      const supabase = createClient(supabaseUrl, supabaseAnonKey)

      const { data, error } = await supabase
        .from("leave_requests")
        .select("*, users(first_name, last_name, department, location)")
        .order("created_at", { ascending: false })
        .limit(100)

      if (error) {
        console.error("[v0] Error fetching all leave requests:", error)
        return
      }

      setAllLeaveRequests(data || [])
    } catch (error) {
      console.error("[v0] Unexpected error:", error)
    }
  }

  const handleLeaveSubmit = async (data: any) => {
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

      if (!supabaseUrl || !supabaseAnonKey) return

      const supabase = createClient(supabaseUrl, supabaseAnonKey)

      const { error } = await supabase.from("leave_requests").insert({
        user_id: userId,
        start_date: data.startDate.toISOString().split("T")[0],
        end_date: data.endDate.toISOString().split("T")[0],
        reason: data.reason,
        leave_type: data.leaveType,
        status: "pending",
      })

      if (error) {
        console.error("[v0] Error submitting leave request:", error)
        return
      }

      setDialogOpen(false)
      await fetchLeaveRequests()
    } catch (error) {
      console.error("[v0] Unexpected error:", error)
    }
  }

  const stats = {
    pending: leaveRequests.filter(r => r.status === "pending").length,
    approved: leaveRequests.filter(r => ["approved", "hr_approved"].includes(r.status.toLowerCase())).length,
    submitted: leaveRequests.length,
    approvals: isManager ? allLeaveRequests.filter(r => r.status === "pending").length : 0,
  }

  const filteredRequests = activeTab === "approved" 
    ? leaveRequests.filter(r => ["approved", "hr_approved"].includes(r.status.toLowerCase()))
    : leaveRequests

  const displayedRequests = searchTerm
    ? filteredRequests.filter(r => 
        r.leave_type?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.reason?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : filteredRequests

  return (
    <div className="space-y-6 w-full">
      {/* Leave Workspace Header - Professional Dark Green Design */}
      <Card className="bg-gradient-to-br from-emerald-800 via-emerald-700 to-teal-700 border-0 shadow-xl overflow-hidden">
        <CardContent className="p-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            {/* Left Section */}
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-white/10 backdrop-blur flex items-center justify-center">
                <Calendar className="h-6 w-6 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="h-4 w-4 text-yellow-400" />
                  <span className="text-xs font-medium text-yellow-400 uppercase tracking-wider">Leave Workspace</span>
                </div>
                <h2 className="text-2xl font-bold text-white">Leave Management</h2>
                <p className="text-emerald-100 text-sm mt-1">
                  Review leave activity, track submissions, and move quickly between personal requests and approvals.
                </p>
                {/* Role Badges */}
                <div className="flex flex-wrap gap-2 mt-3">
                  <Badge className="bg-emerald-600/50 text-emerald-100 border-emerald-500/50 text-xs">
                    Role: {userRole || "staff"}
                  </Badge>
                  <Badge className="bg-emerald-600/50 text-emerald-100 border-emerald-500/50 text-xs">
                    Department Linked
                  </Badge>
                  <Badge className="bg-emerald-600/50 text-emerald-100 border-emerald-500/50 text-xs">
                    Self-service Enabled
                  </Badge>
                </div>
              </div>
            </div>

            {/* Right Section - Stats Grid */}
            <div className="grid grid-cols-2 gap-3 min-w-[280px]">
              <div className="bg-white/10 backdrop-blur rounded-xl p-4 text-center">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-emerald-200 uppercase tracking-wide">Pending</span>
                  <Clock className="h-4 w-4 text-emerald-300" />
                </div>
                <p className="text-3xl font-bold text-white">{stats.pending}</p>
                <p className="text-xs text-emerald-200">Awaiting decision</p>
              </div>
              <div className="bg-white/10 backdrop-blur rounded-xl p-4 text-center">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-emerald-200 uppercase tracking-wide">Approved</span>
                  <CheckCircle2 className="h-4 w-4 text-green-400" />
                </div>
                <p className="text-3xl font-bold text-white">{stats.approved}</p>
                <p className="text-xs text-emerald-200">Confirmed leave</p>
              </div>
              <div className="bg-white/10 backdrop-blur rounded-xl p-4 text-center">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-emerald-200 uppercase tracking-wide">Submitted</span>
                  <FileText className="h-4 w-4 text-emerald-300" />
                </div>
                <p className="text-3xl font-bold text-white">{stats.submitted}</p>
                <p className="text-xs text-emerald-200">My requests</p>
              </div>
              {isManager && (
                <div className="bg-white/10 backdrop-blur rounded-xl p-4 text-center cursor-pointer hover:bg-white/20 transition-colors">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-emerald-200 uppercase tracking-wide">Approvals</span>
                    <ChevronRight className="h-4 w-4 text-emerald-300" />
                  </div>
                  <p className="text-3xl font-bold text-white">{stats.approvals}</p>
                  <p className="text-xs text-emerald-200">Manager queue</p>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Export Section */}
      <Card className="bg-gradient-to-r from-teal-50 to-emerald-50 dark:from-teal-900/20 dark:to-emerald-900/20 border-teal-200 dark:border-teal-800">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Download className="h-5 w-5 text-teal-600" />
              <div>
                <p className="font-semibold text-teal-800 dark:text-teal-200">Export Annual Leave Requests</p>
                <p className="text-sm text-teal-600 dark:text-teal-400">
                  Download all staff annual leave requests for your department/region as an Excel file
                </p>
              </div>
            </div>
            <Button className="bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-600 hover:to-emerald-600 text-white gap-2">
              <Download className="h-4 w-4" />
              Export to Excel
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Leave Application Actions */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">Leave Application Actions</CardTitle>
          </div>
          <p className="text-sm text-muted-foreground">Manage your leave requests and submissions</p>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button
              variant={activeTab === "my-requests" ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveTab("my-requests")}
              className={activeTab === "my-requests" ? "bg-emerald-600 hover:bg-emerald-700" : ""}
            >
              <FileText className="h-4 w-4 mr-2" />
              My Requests ({leaveRequests.length})
            </Button>
            <Button
              onClick={() => setDialogOpen(true)}
              size="sm"
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              <Plus className="h-4 w-4 mr-2" />
              Apply for Leave
            </Button>
            <Button
              variant={activeTab === "approved" ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveTab("approved")}
              className={activeTab === "approved" ? "bg-green-600 hover:bg-green-700" : ""}
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Approved ({stats.approved})
            </Button>
            <Button variant="outline" size="sm">
              <ArrowRight className="h-4 w-4 mr-2" />
              Deferments
            </Button>
            <Button variant="outline" size="sm">
              <RefreshCw className="h-4 w-4 mr-2" />
              Recalls
            </Button>
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Approved Memos
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Search and Refresh */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by leave type or reason..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button variant="outline" size="sm" onClick={fetchLeaveRequests}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Leave Request Dialog */}
      <LeaveRequestDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        staffName={`${userFirstName} ${userLastName}`}
        onSubmit={handleLeaveSubmit}
      />

      {/* Leave Requests Grid */}
      {loading ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Loader2 className="h-10 w-10 animate-spin mx-auto mb-4 text-emerald-600" />
            <p className="text-muted-foreground font-medium">Loading your leave requests...</p>
          </CardContent>
        </Card>
      ) : displayedRequests.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Calendar className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-30" />
            <p className="text-lg font-medium text-muted-foreground">No leave requests yet</p>
            <p className="text-sm text-muted-foreground mt-1 mb-4">
              You haven&apos;t submitted any leave requests. Click the button below to apply for leave.
            </p>
            <Button 
              onClick={() => setDialogOpen(true)}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <Plus className="h-4 w-4 mr-2" />
              Apply for Leave
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {displayedRequests.map((request) => {
            const daysDuration = differenceInDays(
              new Date(request.end_date),
              new Date(request.start_date)
            ) + 1
            const statusBadge = getStatusBadge(request.status)

            return (
              <Card
                key={request.id}
                className="overflow-hidden hover:shadow-lg transition-shadow bg-gradient-to-br from-slate-50 to-white dark:from-slate-900 dark:to-slate-800"
              >
                <CardContent className="p-0">
                  {/* Card Header */}
                  <div className="p-4 border-b bg-white/50 dark:bg-black/20">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold text-base">
                          {request.leave_type || "Annual Leave"}
                        </h3>
                        <p className="text-sm text-muted-foreground mt-0.5">
                          {userFirstName} {userLastName} • {userRole} • {userDepartment || "IT"}
                        </p>
                      </div>
                      <Badge className={statusBadge.className}>
                        {statusBadge.label}
                      </Badge>
                    </div>
                  </div>

                  {/* Dates Section */}
                  <div className="p-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-3">
                        <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400 mb-1">START DATE</p>
                        <p className="font-semibold">
                          {format(new Date(request.start_date), "MMM d, yyyy")}
                        </p>
                      </div>
                      <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-3">
                        <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400 mb-1">END DATE</p>
                        <p className="font-semibold">
                          {format(new Date(request.end_date), "MMM d, yyyy")}
                        </p>
                      </div>
                    </div>

                    {/* Duration and Actions */}
                    <div className="flex items-center justify-between mt-4 pt-3 border-t">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Clock className="h-4 w-4" />
                        <span>{daysDuration} day(s)</span>
                        <span className="text-xs">•</span>
                        <span className="text-xs">
                          Submitted {format(new Date(request.created_at), "MMM d, yyyy")}
                        </span>
                      </div>
                      {request.status.toLowerCase() === "approved" && (
                        <Button variant="ghost" size="sm" className="text-teal-600 hover:text-teal-700">
                          <Download className="h-4 w-4 mr-1" />
                          Memo
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
