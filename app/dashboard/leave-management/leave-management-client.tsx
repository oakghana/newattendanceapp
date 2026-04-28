"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  CheckCircle2,
  XCircle,
  Clock,
  Calendar,
  Loader2,
  AlertCircle,
  Info,
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { format } from "date-fns"
import { LeaveNotificationsClient } from "@/components/leave/leave-notifications-client"
import { useToast } from "@/hooks/use-toast"

interface LeaveRequest {
  id: string
  user_id: string
  start_date: string
  end_date: string
  reason: string
  leave_type: string
  status: "pending" | "approved" | "dismissed"
  created_at: string
  user_name?: string
  department?: string
}

interface LeaveNotification {
  id: string
  leave_request_id: string
  user_id: string
  status: "pending" | "approved" | "dismissed"
  leave_requests: LeaveRequest
}

interface LeaveManagementClientProps {
  userRole: string
  userDepartment: string | null
  initialStaffRequests: LeaveRequest[]
  initialManagerNotifications: LeaveNotification[]
}

interface LeaveTypeOption {
  leaveTypeKey: string
  leaveTypeLabel: string
  entitlementDays: number
  leaveYearPeriod: string
}

export function LeaveManagementClient({
  userRole,
  userDepartment,
  initialStaffRequests,
  initialManagerNotifications,
}: LeaveManagementClientProps) {
  const { toast } = useToast()
  const [staffRequests, setStaffRequests] = useState<LeaveRequest[]>(initialStaffRequests)
  const [managerNotifications, setManagerNotifications] = useState<LeaveNotification[]>(initialManagerNotifications)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [dismissalReason, setDismissalReason] = useState("")
  const supabase = createClient()

  const showUnderReviewToast = () => {
    toast({
      title: "Under Review",
      description: "This action is still under review. Thanks for your patience.",
    })
  }

  const handleApprove = async (notificationId: string) => {
    if (userRole !== "admin") {
      showUnderReviewToast()
      return
    }

    setProcessingId(notificationId)
    try {
      const response = await fetch("/api/leave/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "approve",
          notificationId,
        }),
      })

      if (response.ok) {
        // Refresh the page to get updated data
        window.location.reload()
      }
    } catch (error) {
      console.error("Error approving leave:", error)
    } finally {
      setProcessingId(null)
    }
  }

  const handleDismiss = async (notificationId: string, reason: string) => {
    if (userRole !== "admin") {
      showUnderReviewToast()
      return
    }

    setProcessingId(notificationId)
    try {
      const response = await fetch("/api/leave/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "dismiss",
          notificationId,
          reason,
        }),
      })

      if (response.ok) {
        // Refresh the page to get updated data
        window.location.reload()
        setDismissalReason("")
      }
    } catch (error) {
      console.error("Error dismissing leave:", error)
    } finally {
      setProcessingId(null)
    }
  }

  const pendingRequests = staffRequests.filter((r) => r.status === "pending")
  const approvedRequests = staffRequests.filter((r) => r.status === "approved")
  const pendingNotifications = managerNotifications.filter((n) => n.status === "pending")
  const canUseStaffLeaveHub = ["staff", "nsp", "intern", "it-admin"].includes(userRole || "")

  return (
    <div className="space-y-8">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Calendar className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <h1 className="text-4xl font-heading font-bold text-foreground tracking-tight">Leave Management</h1>
                <p className="text-lg text-muted-foreground font-medium mt-1">
                  Register your Leave in the app
                </p>
              </div>
            </div>



              {/* If manager/admin, show notifications panel inline */}
              {(["admin", "regional_manager", "department_head"].includes(userRole || "")) && (
                <div className="mt-6">
                  <LeaveNotificationsClient />
                </div>
              )}
          </div>
        </div>

        {canUseStaffLeaveHub && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="border-amber-200 bg-amber-50">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-600" />
                  Pending Requests
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-amber-600">{pendingRequests.length}</p>
              </CardContent>
            </Card>

            <Card className="border-green-200 bg-green-50">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  Approved
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-green-600">{approvedRequests.length}</p>
              </CardContent>
            </Card>

            <Card className="border-blue-200 bg-blue-50">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-blue-600" />
                  Total Requested
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-blue-600">{staffRequests.length}</p>
              </CardContent>
            </Card>
          </div>
        )}



        {["admin", "regional_manager", "department_head"].includes(userRole || "") && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="border-amber-200 bg-amber-50">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-600" />
                  Pending Notifications
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-amber-600">{pendingNotifications.length}</p>
              </CardContent>
            </Card>
          </div>
        )}

        <Tabs defaultValue={canUseStaffLeaveHub ? "my-requests" : "pending-approvals"} className="space-y-6">
          <TabsList className="grid w-full grid-cols-2">
            {canUseStaffLeaveHub ? (
              <>
                <TabsTrigger value="my-requests">My Requests ({staffRequests.length})</TabsTrigger>
                <TabsTrigger value="approved">Approved ({approvedRequests.length})</TabsTrigger>
              </>
            ) : (
              <>
                <TabsTrigger value="pending-approvals">Pending ({pendingNotifications.length})</TabsTrigger>
                <TabsTrigger value="history">History</TabsTrigger>
              </>
            )}
          </TabsList>

          {canUseStaffLeaveHub && (
            <>
              <TabsContent value="my-requests" className="space-y-4">
                {staffRequests.length === 0 ? (
                  <Card>
                    <CardContent className="py-12 text-center">
                      <Info className="h-12 w-12 text-blue-400 mx-auto mb-4 opacity-70" />
                      <p className="text-muted-foreground mb-1 font-medium">No leave requests yet</p>
                      <p className="text-sm text-muted-foreground">Use the <strong>Leave Planning 2026/2027</strong> tab above to submit your leave request.</p>
                    </CardContent>
                  </Card>
                ) : (
                  staffRequests.map((request) => (
                    <Card key={request.id} className={`border-2 ${
                      request.status === "pending"
                        ? "border-amber-200"
                        : request.status === "approved"
                          ? "border-green-200"
                          : "border-red-200"
                    }`}>
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <CardTitle>{request.leave_type.charAt(0).toUpperCase() + request.leave_type.slice(1)} Leave</CardTitle>
                            <CardDescription>{request.reason}</CardDescription>
                          </div>
                          <Badge
                            variant={
                              request.status === "pending"
                                ? "outline"
                                : request.status === "approved"
                                  ? "default"
                                  : "destructive"
                            }
                          >
                            {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">Start Date</p>
                            <p className="font-semibold">{format(new Date(request.start_date), "MMM dd, yyyy")}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">End Date</p>
                            <p className="font-semibold">{format(new Date(request.end_date), "MMM dd, yyyy")}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </TabsContent>

              <TabsContent value="approved" className="space-y-4">
                {approvedRequests.length === 0 ? (
                  <Card>
                    <CardContent className="py-12 text-center">
                      <CheckCircle2 className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                      <p className="text-muted-foreground">No approved leaves</p>
                    </CardContent>
                  </Card>
                ) : (
                  approvedRequests.map((request) => (
                    <Card key={request.id} className="border-2 border-green-200 bg-green-50">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-lg">{request.leave_type.charAt(0).toUpperCase() + request.leave_type.slice(1)} Leave</CardTitle>
                        <CardDescription>{request.reason}</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">Start Date</p>
                            <p className="font-semibold">{format(new Date(request.start_date), "MMM dd, yyyy")}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">End Date</p>
                            <p className="font-semibold">{format(new Date(request.end_date), "MMM dd, yyyy")}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </TabsContent>
            </>
          )}

          {["admin", "regional_manager", "department_head"].includes(userRole || "") && (
            <>
              <TabsContent value="pending-approvals" className="space-y-4">
                {pendingNotifications.length === 0 ? (
                  <Card>
                    <CardContent className="py-12 text-center">
                      <CheckCircle2 className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                      <p className="text-muted-foreground">No pending leave requests to approve</p>
                    </CardContent>
                  </Card>
                ) : (
                  pendingNotifications.map((notification) => {
                    const leave = notification.leave_requests
                    return (
                      <Card key={notification.id} className="border-2 border-amber-200">
                        <CardHeader className="pb-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <CardTitle>{leave.leave_type.charAt(0).toUpperCase() + leave.leave_type.slice(1)} Leave Request</CardTitle>
                              <CardDescription>{leave.reason}</CardDescription>
                            </div>
                            <Badge variant="outline">Pending Review</Badge>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <p className="text-xs text-muted-foreground mb-1">Start Date</p>
                              <p className="font-semibold">{format(new Date(leave.start_date), "MMM dd, yyyy")}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground mb-1">End Date</p>
                              <p className="font-semibold">{format(new Date(leave.end_date), "MMM dd, yyyy")}</p>
                            </div>
                          </div>

                          <div className="flex gap-2 pt-4 border-t">
                            <Button
                              onClick={() => handleApprove(notification.id)}
                              disabled={processingId === notification.id}
                              size="sm"
                              className="flex-1 bg-green-600 hover:bg-green-700 gap-2"
                            >
                              {processingId === notification.id ? (
                                <>
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                  Processing...
                                </>
                              ) : (
                                <>
                                  <CheckCircle2 className="h-4 w-4" />
                                  Approve
                                </>
                              )}
                            </Button>
                            <Button
                              onClick={() => handleDismiss(notification.id, "Request dismissed by manager")}
                              disabled={processingId === notification.id}
                              size="sm"
                              variant="destructive"
                              className="flex-1 gap-2"
                            >
                              {processingId === notification.id ? (
                                <>
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                  Processing...
                                </>
                              ) : (
                                <>
                                  <XCircle className="h-4 w-4" />
                                  Dismiss
                                </>
                              )}
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })
                )}
              </TabsContent>

              <TabsContent value="history" className="space-y-4">
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>Historical leave request data would appear here</AlertDescription>
                </Alert>
              </TabsContent>
            </>
          )}
        </Tabs>
      </div>
  )
}