"use client"

import { useState } from "react"
import { format } from "date-fns"
import {
  ArrowUpRight,
  Calendar,
  CheckCircle2,
  FileClock,
  Info,
  Loader2,
  Sparkles,
  XCircle,
} from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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

export function LeaveManagementClient({
  userRole,
  userDepartment,
  initialStaffRequests,
  initialManagerNotifications,
}: LeaveManagementClientProps) {
  const { toast } = useToast()
  const [staffRequests] = useState<LeaveRequest[]>(initialStaffRequests)
  const [managerNotifications] = useState<LeaveNotification[]>(initialManagerNotifications)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [, setDismissalReason] = useState("")

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
  const isManagerView = ["admin", "regional_manager", "department_head"].includes(userRole || "")

  return (
    <div className="space-y-8">
      <Card className="overflow-hidden border-0 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.18),_transparent_28%),linear-gradient(135deg,_#08111f_0%,_#0f2741_48%,_#12355a_100%)] text-white shadow-[0_24px_90px_rgba(8,15,32,0.24)]">
        <CardContent className="p-6 md:p-8">
          <div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
            <div className="space-y-5">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-cyan-100">
                <Sparkles className="h-3.5 w-3.5" /> Leave Workspace
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl border border-white/15 bg-white/10 p-3 backdrop-blur">
                    <Calendar className="h-7 w-7 text-cyan-200" />
                  </div>
                  <div>
                    <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Leave Management</h1>
                    <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-200 md:text-base">
                      Review leave activity, track submissions, and move quickly between personal requests and approvals.
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge className="border border-white/10 bg-white/10 px-3 py-1 text-cyan-100 hover:bg-white/10">
                    Role: {String(userRole || "staff").replaceAll("_", " ")}
                  </Badge>
                  {userDepartment ? (
                    <Badge className="border border-white/10 bg-white/10 px-3 py-1 text-slate-100 hover:bg-white/10">
                      Department Linked
                    </Badge>
                  ) : null}
                  {canUseStaffLeaveHub ? (
                    <Badge className="border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 text-emerald-100 hover:bg-emerald-400/10">
                      Self-service Enabled
                    </Badge>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <LeaveMetricCard label="Pending" value={String(canUseStaffLeaveHub ? pendingRequests.length : pendingNotifications.length)} hint={canUseStaffLeaveHub ? "Awaiting decision" : "Need review"} tone="amber" icon={<FileClock className="h-4 w-4" />} />
              <LeaveMetricCard label="Approved" value={String(approvedRequests.length)} hint="Confirmed leave" tone="emerald" icon={<CheckCircle2 className="h-4 w-4" />} />
              <LeaveMetricCard label="Submitted" value={String(staffRequests.length)} hint="My requests" tone="cyan" icon={<Calendar className="h-4 w-4" />} />
              <LeaveMetricCard label="Approvals" value={String(managerNotifications.length)} hint="Manager queue" tone="violet" icon={<ArrowUpRight className="h-4 w-4" />} />
            </div>
          </div>
        </CardContent>
      </Card>

      {isManagerView && (
        <Card className="border-slate-200 bg-white/85 shadow-sm backdrop-blur">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl text-slate-900">Notifications Inbox</CardTitle>
            <CardDescription>Inline approval notifications for managers, heads, and admins.</CardDescription>
          </CardHeader>
          <CardContent>
            <LeaveNotificationsClient />
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue={canUseStaffLeaveHub ? "my-requests" : "pending-approvals"} className="space-y-6">
        <TabsList className="flex h-auto w-full flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white/90 p-2 shadow-sm">
          {canUseStaffLeaveHub ? (
            <>
              <TabsTrigger value="my-requests" className="rounded-xl px-4 py-2 data-[state=active]:bg-slate-900 data-[state=active]:text-white">
                My Requests ({staffRequests.length})
              </TabsTrigger>
              <TabsTrigger value="approved" className="rounded-xl px-4 py-2 data-[state=active]:bg-slate-900 data-[state=active]:text-white">
                Approved ({approvedRequests.length})
              </TabsTrigger>
            </>
          ) : (
            <>
              <TabsTrigger value="pending-approvals" className="rounded-xl px-4 py-2 data-[state=active]:bg-slate-900 data-[state=active]:text-white">
                Pending ({pendingNotifications.length})
              </TabsTrigger>
              <TabsTrigger value="history" className="rounded-xl px-4 py-2 data-[state=active]:bg-slate-900 data-[state=active]:text-white">
                History
              </TabsTrigger>
            </>
          )}
        </TabsList>

        {canUseStaffLeaveHub && (
          <>
            <TabsContent value="my-requests" className="space-y-4">
              {staffRequests.length === 0 ? (
                <Card className="border border-dashed border-slate-300 bg-slate-50/80">
                  <CardContent className="py-14 text-center">
                    <Info className="mx-auto mb-4 h-12 w-12 text-cyan-500/70" />
                    <p className="mb-1 font-medium text-slate-800">No leave requests yet</p>
                    <p className="text-sm text-slate-500">Use Leave Planning 2026/2027 to submit your next leave request.</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4 lg:grid-cols-2">
                  {staffRequests.map((request) => (
                    <LeaveRequestCard key={request.id} request={request} />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="approved" className="space-y-4">
              {approvedRequests.length === 0 ? (
                <Card className="border border-dashed border-slate-300 bg-slate-50/80">
                  <CardContent className="py-14 text-center">
                    <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-slate-400" />
                    <p className="font-medium text-slate-700">No approved leave records yet</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4 lg:grid-cols-2">
                  {approvedRequests.map((request) => (
                    <LeaveRequestCard key={request.id} request={request} emphasizeApproved />
                  ))}
                </div>
              )}
            </TabsContent>
          </>
        )}

        {isManagerView && (
          <>
            <TabsContent value="pending-approvals" className="space-y-4">
              {pendingNotifications.length === 0 ? (
                <Card className="border border-dashed border-slate-300 bg-slate-50/80">
                  <CardContent className="py-14 text-center">
                    <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-slate-400" />
                    <p className="font-medium text-slate-700">No pending leave requests to approve</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4 xl:grid-cols-2">
                  {pendingNotifications.map((notification) => {
                    const leave = notification.leave_requests
                    return (
                      <Card key={notification.id} className="overflow-hidden border border-amber-200 bg-[linear-gradient(180deg,_rgba(255,251,235,0.88)_0%,_#ffffff_100%)] shadow-sm">
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <CardTitle className="text-lg text-slate-900">{formatLeaveType(leave.leave_type)} Leave Request</CardTitle>
                              <CardDescription className="mt-1 line-clamp-2">{leave.reason}</CardDescription>
                            </div>
                            <Badge className="border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-50">Pending Review</Badge>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="grid grid-cols-2 gap-3 text-sm">
                            <div className="rounded-xl border border-slate-200 bg-white p-3">
                              <p className="text-xs uppercase tracking-wide text-slate-400">Start Date</p>
                              <p className="mt-1 font-semibold text-slate-900">{format(new Date(leave.start_date), "MMM dd, yyyy")}</p>
                            </div>
                            <div className="rounded-xl border border-slate-200 bg-white p-3">
                              <p className="text-xs uppercase tracking-wide text-slate-400">End Date</p>
                              <p className="mt-1 font-semibold text-slate-900">{format(new Date(leave.end_date), "MMM dd, yyyy")}</p>
                            </div>
                          </div>

                          <div className="flex gap-2 border-t border-slate-200 pt-4">
                            <Button
                              onClick={() => handleApprove(notification.id)}
                              disabled={processingId === notification.id}
                              size="sm"
                              className="flex-1 gap-2 bg-emerald-600 hover:bg-emerald-700"
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
                  })}
                </div>
              )}
            </TabsContent>

            <TabsContent value="history" className="space-y-4">
              <Alert className="border-slate-200 bg-white shadow-sm">
                <AlertDescription>Historical leave request data will be surfaced here when the archive view is enabled.</AlertDescription>
              </Alert>
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  )
}

function LeaveMetricCard({
  label,
  value,
  hint,
  tone,
  icon,
}: {
  label: string
  value: string
  hint: string
  tone: "amber" | "emerald" | "cyan" | "violet"
  icon: React.ReactNode
}) {
  const tones = {
    amber: "border-amber-300/20 bg-amber-300/10 text-amber-50",
    emerald: "border-emerald-300/20 bg-emerald-300/10 text-emerald-50",
    cyan: "border-cyan-300/20 bg-cyan-300/10 text-cyan-50",
    violet: "border-violet-300/20 bg-violet-300/10 text-violet-50",
  }

  return (
    <div className={`rounded-2xl border p-4 backdrop-blur ${tones[tone]}`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-white/70">{label}</p>
          <p className="mt-2 text-3xl font-semibold text-white">{value}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/10 p-2 text-white">{icon}</div>
      </div>
      <p className="mt-2 text-xs text-white/70">{hint}</p>
    </div>
  )
}

function LeaveRequestCard({
  request,
  emphasizeApproved = false,
}: {
  request: LeaveRequest
  emphasizeApproved?: boolean
}) {
  const statusTone =
    request.status === "approved"
      ? "border-emerald-200 bg-emerald-50/60"
      : request.status === "pending"
        ? "border-amber-200 bg-amber-50/60"
        : "border-rose-200 bg-rose-50/60"

  return (
    <Card className={`overflow-hidden border shadow-sm ${emphasizeApproved ? "border-emerald-200 bg-emerald-50/70" : statusTone}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg text-slate-900">{formatLeaveType(request.leave_type)} Leave</CardTitle>
            <CardDescription className="mt-1 line-clamp-2">{request.reason}</CardDescription>
          </div>
          <Badge className={request.status === "approved" ? "bg-emerald-600 text-white hover:bg-emerald-600" : request.status === "pending" ? "border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-50" : "bg-rose-600 text-white hover:bg-rose-600"}>
            {formatLeaveType(request.status)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="text-xs uppercase tracking-wide text-slate-400">Start Date</p>
            <p className="mt-1 font-semibold text-slate-900">{format(new Date(request.start_date), "MMM dd, yyyy")}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="text-xs uppercase tracking-wide text-slate-400">End Date</p>
            <p className="mt-1 font-semibold text-slate-900">{format(new Date(request.end_date), "MMM dd, yyyy")}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function formatLeaveType(value: string) {
  return String(value || "")
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}
