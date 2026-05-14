"use client"

import { useState, useEffect } from "react"
import { createClient } from "@supabase/supabase-js"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Plus, Calendar, Clock, CheckCircle2, XCircle, AlertCircle, Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { format } from "date-fns"
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

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  approved: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  draft: "bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-400",
}

const statusIcons: Record<string, any> = {
  pending: <Clock className="h-4 w-4" />,
  approved: <CheckCircle2 className="h-4 w-4" />,
  rejected: <XCircle className="h-4 w-4" />,
  draft: <AlertCircle className="h-4 w-4" />,
}

export function LeaveManagementClient({
  userId,
  userRole,
  userFirstName,
  userLastName,
}: LeaveManagementClientProps) {
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)

  useEffect(() => {
    fetchLeaveRequests()
  }, [userId])

  const fetchLeaveRequests = async () => {
    try {
      setLoading(true)
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

      if (!supabaseUrl || !supabaseAnonKey) {
        console.error("Missing Supabase configuration")
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
      fetchLeaveRequests()
    } catch (error) {
      console.error("[v0] Unexpected error submitting leave request:", error)
    }
  }

  return (
    <div className="space-y-6 w-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Leave Requests</h2>
          <p className="text-muted-foreground mt-1">
            Manage your leave requests and approvals
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Request Leave
        </Button>
      </div>

      {/* Leave Request Dialog */}
      <LeaveRequestDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        staffName={`${userFirstName} ${userLastName}`}
        onSubmit={handleLeaveSubmit}
      />

      {/* Statistics Cards */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Total Requests</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{leaveRequests.length}</div>
            <p className="text-xs text-muted-foreground mt-1">All time</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-yellow-600">
              {leaveRequests.filter(r => r.status === "pending").length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Awaiting approval</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Approved</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">
              {leaveRequests.filter(r => r.status === "approved").length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Confirmed</p>
          </CardContent>
        </Card>
      </div>

      {/* Leave Requests List */}
      <Card>
        <CardHeader>
          <CardTitle>Your Leave Requests</CardTitle>
          <CardDescription>View and manage all your leave requests</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : leaveRequests.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Calendar className="h-12 w-12 mx-auto mb-4 opacity-40" />
              <p className="font-medium">No leave requests yet</p>
              <p className="text-sm">Click "Request Leave" to submit a new request</p>
            </div>
          ) : (
            <div className="space-y-3">
              {leaveRequests.map((request) => (
                <div
                  key={request.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                >
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">
                        {format(new Date(request.start_date), "MMM dd")} -{" "}
                        {format(new Date(request.end_date), "MMM dd, yyyy")}
                      </p>
                      <Badge
                        variant="outline"
                        className={statusColors[request.status] || statusColors.draft}
                      >
                        <span className="flex items-center gap-1">
                          {statusIcons[request.status]}
                          {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                        </span>
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{request.reason}</p>
                    <p className="text-xs text-muted-foreground">
                      Submitted {format(new Date(request.created_at), "MMM dd, yyyy")}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
