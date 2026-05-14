"use client"

import { useState, useEffect } from "react"
import { createClient } from "@supabase/supabase-js"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Plus, Calendar, Clock, CheckCircle2, XCircle, AlertCircle, Loader2, Search, RefreshCw } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
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
}

const getStatusColor = (status: string) => {
  const colors: Record<string, { badge: string; bg: string }> = {
    pending: { badge: "bg-yellow-100 text-yellow-800", bg: "bg-yellow-50 border-yellow-200" },
    approved: { badge: "bg-green-100 text-green-800", bg: "bg-green-50 border-green-200" },
    rejected: { badge: "bg-red-100 text-red-800", bg: "bg-red-50 border-red-200" },
    "hr_reviewed": { badge: "bg-blue-100 text-blue-800", bg: "bg-blue-50 border-blue-200" },
  }
  return colors[status.toLowerCase()] || colors.pending
}

const statusIcons: Record<string, any> = {
  pending: <Clock className="h-4 w-4" />,
  approved: <CheckCircle2 className="h-4 w-4" />,
  rejected: <XCircle className="h-4 w-4" />,
  "hr_reviewed": <AlertCircle className="h-4 w-4" />,
}

export function LeaveManagementClient({
  userId,
  userRole,
  userFirstName,
  userLastName,
}: LeaveManagementClientProps) {
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([])
  const [filteredRequests, setFilteredRequests] = useState<LeaveRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [filterStatus, setFilterStatus] = useState("all")

  useEffect(() => {
    fetchLeaveRequests()
  }, [userId])

  useEffect(() => {
    applyFilters()
  }, [leaveRequests, searchTerm, filterStatus])

  const fetchLeaveRequests = async () => {
    try {
      setLoading(true)
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

      if (!supabaseUrl || !supabaseAnonKey) {
        console.error("[v0] Missing Supabase configuration")
        return
      }

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
      console.error("[v0] Unexpected error fetching leave requests:", error)
    } finally {
      setLoading(false)
    }
  }

  const applyFilters = () => {
    let filtered = leaveRequests

    if (filterStatus !== "all") {
      filtered = filtered.filter(r => r.status === filterStatus)
    }

    if (searchTerm) {
      filtered = filtered.filter(r =>
        r.reason?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.leave_type?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }

    setFilteredRequests(filtered)
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
      console.error("[v0] Unexpected error submitting leave request:", error)
    }
  }

  const stats = {
    pending: leaveRequests.filter(r => r.status === "pending").length,
    approved: leaveRequests.filter(r => r.status === "approved").length,
    submitted: leaveRequests.filter(r => r.status !== "pending").length,
    total: leaveRequests.length,
  }

  return (
    <div className="space-y-6 w-full">
      {/* Stats Cards - Professional Design */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Pending", value: stats.pending, color: "from-orange-500 to-orange-600", textColor: "text-white" },
          { label: "Approved", value: stats.approved, color: "from-green-500 to-green-600", textColor: "text-white" },
          { label: "Submitted", value: stats.submitted, color: "from-blue-500 to-blue-600", textColor: "text-white" },
          { label: "Total", value: stats.total, color: "from-purple-500 to-purple-600", textColor: "text-white" },
        ].map((stat, i) => (
          <Card key={i} className={`bg-gradient-to-br ${stat.color} border-0 shadow-lg`}>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className={`text-3xl font-bold ${stat.textColor}`}>{stat.value}</div>
                <p className={`text-sm font-medium mt-1 ${stat.textColor} opacity-90`}>{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Action Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="flex gap-2">
          <Button
            onClick={() => setDialogOpen(true)}
            className="bg-orange-500 hover:bg-orange-600 text-white gap-2 flex-1 sm:flex-none"
          >
            <Plus className="h-4 w-4" />
            Request Leave
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={fetchLeaveRequests}
            className="flex-1 sm:flex-none"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search leaves..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Leave Request Dialog */}
      <LeaveRequestDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        staffName={`${userFirstName} ${userLastName}`}
        onSubmit={handleLeaveSubmit}
      />

      {/* Leave Requests List */}
      <div className="space-y-3">
        {loading ? (
          <Card>
            <CardContent className="pt-12 text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground font-medium">Loading your leaves...</p>
            </CardContent>
          </Card>
        ) : filteredRequests.length === 0 ? (
          <Card>
            <CardContent className="pt-12 text-center">
              <Calendar className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <p className="text-muted-foreground font-medium">
                {leaveRequests.length === 0 ? "No leave requests yet" : "No results found"}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {leaveRequests.length === 0
                  ? "Click 'Request Leave' to submit your first request"
                  : "Try adjusting your search or filter"}
              </p>
            </CardContent>
          </Card>
        ) : (
          filteredRequests.map((request) => {
            const daysDuration = differenceInDays(
              new Date(request.end_date),
              new Date(request.start_date)
            ) + 1
            const colors = getStatusColor(request.status)

            return (
              <Card
                key={request.id}
                className={`border-l-4 transition-all hover:shadow-md cursor-pointer ${colors.bg}`}
                style={{
                  borderLeftColor: request.status === "approved" ? "#10b981" : request.status === "pending" ? "#f59e0b" : "#ef4444",
                }}
              >
                <CardContent className="pt-6">
                  <div className="space-y-4">
                    {/* Header with Type and Status */}
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="font-semibold text-base">
                          {request.leave_type || "Leave Request"}
                        </h3>
                        <p className="text-sm text-muted-foreground mt-1">{request.reason}</p>
                      </div>
                      <Badge className={colors.badge}>
                        <span className="flex items-center gap-1">
                          {statusIcons[request.status.toLowerCase()] || statusIcons.pending}
                          {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                        </span>
                      </Badge>
                    </div>

                    {/* Dates Grid */}
                    <div className="grid grid-cols-3 gap-4">
                      <div className="bg-white/50 dark:bg-black/10 rounded-lg p-3">
                        <p className="text-xs font-medium text-muted-foreground mb-1">START DATE</p>
                        <p className="font-semibold text-sm">
                          {format(new Date(request.start_date), "MMM d, yyyy")}
                        </p>
                      </div>
                      <div className="bg-white/50 dark:bg-black/10 rounded-lg p-3">
                        <p className="text-xs font-medium text-muted-foreground mb-1">END DATE</p>
                        <p className="font-semibold text-sm">
                          {format(new Date(request.end_date), "MMM d, yyyy")}
                        </p>
                      </div>
                      <div className="bg-white/50 dark:bg-black/10 rounded-lg p-3">
                        <p className="text-xs font-medium text-muted-foreground mb-1">DURATION</p>
                        <p className="font-semibold text-sm">{daysDuration} day(s)</p>
                      </div>
                    </div>

                    {/* Footer */}
                    <div className="text-xs text-muted-foreground pt-2 border-t">
                      Submitted {format(new Date(request.created_at), "MMM d, yyyy 'at' HH:mm")}
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
