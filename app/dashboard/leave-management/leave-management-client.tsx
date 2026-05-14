"use client"

import { useState, useEffect } from "react"
import { createClient } from "@supabase/supabase-js"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Plus, Calendar, Download, Loader2 } from "lucide-react"
import { format, differenceInDays } from "date-fns"

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

export function LeaveManagementClient({
  userId,
  userRole,
  userFirstName,
  userLastName,
}: LeaveManagementClientProps) {
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchLeaveRequests()
  }, [userId])

  const fetchLeaveRequests = async () => {
    try {
      setLoading(true)
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

      if (!supabaseUrl || !supabaseAnonKey) {
        console.error("[v0] Missing Supabase config")
        return
      }

      const supabase = createClient(supabaseUrl, supabaseAnonKey)
      const { data, error } = await supabase
        .from("leave_requests")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50)

      if (error) {
        console.error("[v0] Error fetching:", error)
        setLeaveRequests([])
        return
      }

      setLeaveRequests(data || [])
    } catch (err) {
      console.error("[v0] Exception:", err)
      setLeaveRequests([])
    } finally {
      setLoading(false)
    }
  }

  const stats = {
    pending: leaveRequests.filter(r => r.status === "pending").length,
    approved: leaveRequests.filter(r => r.status === "approved").length,
    total: leaveRequests.length,
  }

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "approved":
        return "bg-green-100 text-green-800"
      case "rejected":
        return "bg-red-100 text-red-800"
      case "pending":
        return "bg-yellow-100 text-yellow-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-3xl font-bold mb-2">Leave Management</h2>
        <p className="text-gray-600">2025/2026 Leave Year • Quality Control Company Limited</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: "Pending", value: stats.pending, color: "from-orange-500 to-orange-600" },
          { label: "Approved", value: stats.approved, color: "from-green-500 to-green-600" },
          { label: "Submitted", value: stats.total, color: "from-blue-500 to-blue-600" },
          { label: "Manager Queue", value: 0, color: "from-purple-500 to-purple-600" },
        ].map((stat, i) => (
          <Card key={i} className={`bg-gradient-to-br ${stat.color} border-0 text-white`}>
            <CardContent className="pt-6">
              <div className="text-3xl font-bold">{stat.value}</div>
              <p className="text-sm mt-1 opacity-90">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Export Section */}
      <Card className="bg-gradient-to-r from-purple-50 to-blue-50 border-purple-200">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold">Export Annual Leave Requests</p>
              <p className="text-sm text-gray-600 mt-1">Download all staff annual leave requests for your department as an Excel file</p>
            </div>
            <Button className="bg-purple-600 hover:bg-purple-700 text-white gap-2">
              <Download className="h-4 w-4" />
              Export to Excel
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-2">
            <Button className="bg-orange-500 hover:bg-orange-600 text-white" size="sm">
              <Calendar className="h-4 w-4 mr-2" />
              Request
            </Button>
            <Button className="bg-orange-500 hover:bg-orange-600 text-white" size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Apply
            </Button>
            <Button variant="outline" size="sm">
              HOD Review
            </Button>
            <Button variant="outline" size="sm">
              HR Leave Office
            </Button>
            <Button variant="outline" size="sm">
              HR Approvals
            </Button>
            <Button variant="outline" size="sm">
              All Requests
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Leave Requests List */}
      <Card>
        <CardHeader>
          <CardTitle>Your Leave Requests</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : leaveRequests.length === 0 ? (
            <div className="text-center py-12">
              <Calendar className="h-12 w-12 mx-auto mb-4 opacity-40" />
              <p className="font-medium">No leave requests yet</p>
              <p className="text-sm text-gray-600">Click 'Apply' to submit your first request</p>
            </div>
          ) : (
            <div className="space-y-3">
              {leaveRequests.map((request) => {
                const duration = differenceInDays(
                  new Date(request.end_date),
                  new Date(request.start_date)
                ) + 1

                return (
                  <div
                    key={request.id}
                    className="p-4 border rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h4 className="font-semibold">{request.leave_type || "Leave Request"}</h4>
                        <p className="text-sm text-gray-600 mt-1">{request.reason}</p>
                      </div>
                      <Badge className={getStatusColor(request.status)}>
                        {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-sm">
                      <div className="bg-gray-50 p-2 rounded">
                        <p className="text-xs text-gray-600">Start</p>
                        <p className="font-semibold">{format(new Date(request.start_date), "MMM dd")}</p>
                      </div>
                      <div className="bg-gray-50 p-2 rounded">
                        <p className="text-xs text-gray-600">End</p>
                        <p className="font-semibold">{format(new Date(request.end_date), "MMM dd")}</p>
                      </div>
                      <div className="bg-gray-50 p-2 rounded">
                        <p className="text-xs text-gray-600">Duration</p>
                        <p className="font-semibold">{duration} days</p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
