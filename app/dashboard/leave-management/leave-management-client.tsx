"use client"

import { useState } from "react"
import { format } from "date-fns"
import {
  ArrowUpRight,
  Calendar,
  CheckCircle2,
  Copy,
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"

interface LeaveRequest {
  id: string
  user_id: string
  start_date: string
  end_date: string
  reason: string
  leave_type: string
  status: string
  created_at: string
  user_name?: string
  department?: string
}

interface LeaveNotification {
  id: string
  leave_plan_request_id?: string
  leave_request_id?: string
  user_id?: string
  status: string
  leave_requests: LeaveRequest
  requester_role?: string
  requester_name?: string
  waiting_days?: number
}

interface LeaveManagementClientProps {
  userRole: string
  userDepartment: string | null
  hasHodLinkage: boolean
  inactivityDays: number
  initialStaffRequests: LeaveRequest[]
  initialManagerNotifications: LeaveNotification[]
}

export function LeaveManagementClient({
  userRole,
  userDepartment,
  hasHodLinkage,
  inactivityDays,
  initialStaffRequests,
  initialManagerNotifications,
}: LeaveManagementClientProps) {
    const pendingStatuses = new Set(["pending", "pending_hod", "pending_hr", "pending_manager_review", "manager_confirmed"])
    const approvedStatuses = new Set(["approved", "hr_approved"])
    const editableStatuses = new Set(["pending", "pending_manager_review", "manager_changes_requested", "manager_rejected", "hr_rejected"])

  const { toast } = useToast()
  const [staffRequests, setStaffRequests] = useState<LeaveRequest[]>(initialStaffRequests)
  const [managerNotifications] = useState<LeaveNotification[]>(initialManagerNotifications)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [, setDismissalReason] = useState("")
  const [editingRequest, setEditingRequest] = useState<LeaveRequest | null>(null)
  const [editStartDate, setEditStartDate] = useState("")
  const [editEndDate, setEditEndDate] = useState("")
  const [editReason, setEditReason] = useState("")
  const [editLeaveType, setEditLeaveType] = useState("")

  const leaveApprovalTemplate = `QUALITY CONTROL COMPANY LTD.\nHUMAN RESOURCE DIRECTORATE\n\nSUBJECT: LEAVE APPROVAL NOTICE\n\nYour leave request has been reviewed and approved.\n\nKindly proceed based on the approved period and handover guidance from your supervisor.\n\nRegards,\nHR Administration\nQuality Control Company Ltd.`

  const leaveRejectionTemplate = `QUALITY CONTROL COMPANY LTD.\nHUMAN RESOURCE DIRECTORATE\n\nSUBJECT: LEAVE REQUEST FEEDBACK\n\nYour leave request has not been approved at this time.\n\nReason: [Insert review reason here]\n\nYou may reapply with updated dates or documentation where applicable.\n\nRegards,\nHR Administration\nQuality Control Company Ltd.`

  const copyTemplate = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value)
      toast({ title: `${label} copied`, description: "Template copied to clipboard." })
    } catch {
      toast({ title: "Copy failed", description: "Please copy manually.", variant: "destructive" })
    }
  }

  const showUnderReviewToast = () => {
    toast({
      title: "Under Review",
      description: "This action is still under review. Thanks for your patience.",
    })
  }

  const handleDeleteAllTestingRecords = async () => {
    if (String(userRole || "") !== "admin") {
      toast({ title: "Forbidden", description: "Only admin can clear leave testing records.", variant: "destructive" })
      return
    }

    if (!window.confirm("Delete all leave testing records, notifications, and planning items? This cannot be undone.")) {
      return
    }

    setProcessingId("leave-testing-cleanup")
    try {
      const response = await fetch("/api/leave/request", { method: "DELETE" })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(result?.error || "Failed to clear leave testing records")
      }
      toast({ title: "Leave records cleared", description: result?.message || "Testing leave records removed successfully." })
      window.location.reload()
    } catch (error) {
      toast({
        title: "Cleanup failed",
        description: error instanceof Error ? error.message : "Failed to clear leave testing records.",
        variant: "destructive",
      })
    } finally {
      setProcessingId(null)
    }
  }

  const openEditRequest = (request: LeaveRequest) => {
    setEditingRequest(request)
    setEditStartDate(request.start_date)
    setEditEndDate(request.end_date)
    setEditReason(request.reason || "")
    setEditLeaveType(request.leave_type || "annual")
  }

  const closeEditDialog = () => {
    setEditingRequest(null)
    setEditStartDate("")
    setEditEndDate("")
    setEditReason("")
    setEditLeaveType("")
  }

  const handleUpdateLeaveRequest = async () => {
    if (!editingRequest) return
    if (!editStartDate || !editEndDate || !editLeaveType || !editReason.trim()) {
      toast({ title: "Incomplete update", description: "Start date, end date, leave type, and reason are required.", variant: "destructive" })
      return
    }

    const response = await fetch("/api/leave/planning", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editingRequest.id,
        preferred_start_date: editStartDate,
        preferred_end_date: editEndDate,
        reason: editReason,
        leave_type: editLeaveType,
      }),
    })

    const result = await response.json().catch(() => ({}))
    if (!response.ok) {
      toast({ title: "Update failed", description: result?.error || "Could not edit leave request.", variant: "destructive" })
      return
    }

    setStaffRequests((prev) =>
      prev.map((row) =>
        row.id === editingRequest.id
          ? {
              ...row,
              start_date: editStartDate,
              end_date: editEndDate,
              reason: editReason.trim(),
              leave_type: editLeaveType,
              status: "pending_manager_review",
            }
          : row,
      ),
    )

    toast({ title: "Leave request updated", description: "Your leave request was updated before reviewer action." })
    closeEditDialog()
  }

  const handleApprove = async (notificationId: string) => {
    const normalized = String(userRole || "").toLowerCase().replace(/[\s-]+/g, "_")
    const canManageLeave = ["admin", "department_head", "regional_manager", "hr_officer", "manager_hr", "director_hr", "hr_director", "loan_office"].includes(normalized)
    if (!canManageLeave) {
      showUnderReviewToast()
      return
    }

    const notification = managerNotifications.find((row) => row.id === notificationId)
    const requestId = String(notification?.leave_plan_request_id || notification?.leave_requests?.id || "")
    if (!requestId) {
      toast({ title: "Missing assignment", description: "Leave planning request id was not found.", variant: "destructive" })
      return
    }

    setProcessingId(notificationId)
    try {
      const response = await fetch("/api/leave/planning/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "approve",
          leave_plan_request_id: requestId,
        }),
      })

      if (response.ok) {
        toast({ title: "Leave approved", description: "Refreshing the view with latest status." })
        window.location.reload()
      } else {
        const result = await response.json().catch(() => ({}))
        throw new Error(result?.error || "Failed to approve leave request")
      }
    } catch (error) {
      console.error("Error approving leave:", error)
      toast({
        title: "Approval failed",
        description: error instanceof Error ? error.message : "Could not approve leave request.",
        variant: "destructive",
      })
    } finally {
      setProcessingId(null)
    }
  }

  const handleDismiss = async (notificationId: string, reason: string) => {
    const normalized = String(userRole || "").toLowerCase().replace(/[\s-]+/g, "_")
    const canManageLeave = ["admin", "department_head", "regional_manager", "hr_officer", "manager_hr", "director_hr", "hr_director", "loan_office"].includes(normalized)
    if (!canManageLeave) {
      showUnderReviewToast()
      return
    }

    if (!String(reason || "").trim()) {
      toast({
        title: "Reason required",
        description: "Please provide a reason before rejecting.",
        variant: "destructive",
      })
      return
    }

    const notification = managerNotifications.find((row) => row.id === notificationId)
    const requestId = String(notification?.leave_plan_request_id || notification?.leave_requests?.id || "")
    if (!requestId) {
      toast({ title: "Missing assignment", description: "Leave planning request id was not found.", variant: "destructive" })
      return
    }

    setProcessingId(notificationId)
    try {
      const response = await fetch("/api/leave/planning/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reject",
          leave_plan_request_id: requestId,
          recommendation: reason,
        }),
      })

      if (response.ok) {
        toast({ title: "Request rejected", description: "Refreshing the view with latest status." })
        window.location.reload()
        setDismissalReason("")
      } else {
        const result = await response.json().catch(() => ({}))
        throw new Error(result?.error || "Failed to reject leave request")
      }
    } catch (error) {
      console.error("Error rejecting leave:", error)
      toast({
        title: "Rejection failed",
        description: error instanceof Error ? error.message : "Could not reject leave request.",
        variant: "destructive",
      })
    } finally {
      setProcessingId(null)
    }
  }

  const pendingRequests = staffRequests.filter((r) => pendingStatuses.has(String(r.status || "")))
  const approvedRequests = staffRequests.filter((r) => approvedStatuses.has(String(r.status || "")))
  const pendingNotifications = managerNotifications.filter((n) => pendingStatuses.has(String(n.status || "")))
  const adminAllPending = pendingNotifications
  const adminStaffQueue = pendingNotifications.filter((n) => {
    const role = String(n.requester_role || "").toLowerCase()
    return ["staff", "nsp", "intern", "it-admin", "it_admin", "contract"].includes(role)
  })
  const adminHodQueue = pendingNotifications.filter((n) => String(n.requester_role || "").toLowerCase() === "department_head")
  const adminRegionalQueue = pendingNotifications.filter((n) => String(n.requester_role || "").toLowerCase() === "regional_manager")
  const adminDelayedQueue = pendingNotifications.filter((n) => Number(n.waiting_days || 0) >= inactivityDays)

  const canUseStaffLeaveHub = ["staff", "nsp", "intern", "it-admin", "department_head", "regional_manager", "admin", "loan_office", "accounts", "director_hr", "manager_hr", "hr_office", "audit_staff", "contract", "loan_committee", "committee"].includes(userRole || "")
  const isManagerView = ["admin", "regional_manager", "department_head", "it-admin", "hr_officer", "manager_hr", "director_hr", "hr_director"].includes(userRole || "")
  const isAdminView = String(userRole || "").toLowerCase() === "admin"
  const normalizedRole = String(userRole || "").toLowerCase().trim().replace(/[-\s]+/g, "_")
  const canViewHrTemplates = ["admin", "hr_officer", "manager_hr", "director_hr", "hr_director"].includes(normalizedRole)

  const renderManagerNotifications = (rows: LeaveNotification[], emptyMessage: string) => {
    if (rows.length === 0) {
      return (
        <Card className="border border-dashed border-slate-300 bg-slate-50/80">
          <CardContent className="py-14 text-center">
            <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-slate-400" />
            <p className="font-medium text-slate-700">{emptyMessage}</p>
          </CardContent>
        </Card>
      )
    }

    return (
      <Card className="border border-slate-200 bg-white shadow-sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Staff</th>
                  <th className="px-4 py-3">Leave Type</th>
                  <th className="px-4 py-3">Start</th>
                  <th className="px-4 py-3">End</th>
                  <th className="px-4 py-3">Stage</th>
                  <th className="px-4 py-3">Reason</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((notification) => {
                  const leave = notification.leave_requests
                  return (
                    <tr key={notification.id} className="border-t border-slate-100 align-top">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{notification.requester_name || "Staff"}</div>
                        <div className="text-xs text-slate-500">{formatLeaveType(String(notification.requester_role || "staff"))}</div>
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-800">{formatLeaveType(leave.leave_type)}</td>
                      <td className="px-4 py-3">{format(new Date(leave.start_date), "MMM dd, yyyy")}</td>
                      <td className="px-4 py-3">{format(new Date(leave.end_date), "MMM dd, yyyy")}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline">{formatLeaveType(String(notification.status || "pending"))}</Badge>
                      </td>
                      <td className="max-w-[320px] px-4 py-3 text-xs text-slate-600">{leave.reason}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <Button
                            onClick={() => handleApprove(notification.id)}
                            disabled={processingId === notification.id}
                            size="sm"
                            className="gap-1 bg-emerald-600 hover:bg-emerald-700"
                          >
                            {processingId === notification.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                            Approve
                          </Button>
                          <Button
                            onClick={() => {
                              const rejectReason = window.prompt("Provide rejection reason") || ""
                              if (!rejectReason.trim()) return
                              void handleDismiss(notification.id, rejectReason)
                            }}
                            disabled={processingId === notification.id}
                            size="sm"
                            variant="destructive"
                            className="gap-1"
                          >
                            {processingId === notification.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                            Reject
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    )
  }

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

      {canUseStaffLeaveHub && !hasHodLinkage && (
        <Alert className="border-amber-200 bg-amber-50">
          <AlertDescription className="text-amber-800">
            Your leave profile is not linked to a HOD yet. Kindly inform HR/Admin to complete your HOD linkage so approvals route correctly.
          </AlertDescription>
        </Alert>
      )}

      {canViewHrTemplates && (
        <Card className="border-blue-200 bg-blue-50/60 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg text-blue-900">HR Response Templates</CardTitle>
            <CardDescription>
              Professional approval and rejection templates for endorsed leave requests.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-xl border border-blue-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Approval Template</p>
              <pre className="mt-2 whitespace-pre-wrap text-xs text-slate-700">{leaveApprovalTemplate}</pre>
              <Button size="sm" variant="outline" className="mt-3" onClick={() => copyTemplate(leaveApprovalTemplate, "Approval template")}>
                <Copy className="h-4 w-4 mr-1" />
                Copy Approval Template
              </Button>
            </div>

            <div className="rounded-xl border border-rose-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-rose-700">Rejection Template</p>
              <pre className="mt-2 whitespace-pre-wrap text-xs text-slate-700">{leaveRejectionTemplate}</pre>
              <Button size="sm" variant="outline" className="mt-3" onClick={() => copyTemplate(leaveRejectionTemplate, "Rejection template")}>
                <Copy className="h-4 w-4 mr-1" />
                Copy Rejection Template
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {String(userRole || "") === "admin" && (
        <Card className="border-rose-200 bg-rose-50/70 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg text-rose-900">Testing Data Cleanup</CardTitle>
            <CardDescription>Clear leave testing data before go-live so management starts from a clean state.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="destructive" onClick={handleDeleteAllTestingRecords} disabled={processingId === "leave-testing-cleanup"}>
              {processingId === "leave-testing-cleanup" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Delete All Leave Testing Records
            </Button>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="my-requests" className="space-y-6">
        <TabsList className="flex h-auto w-full flex-wrap gap-1.5 rounded-2xl border border-slate-200 bg-slate-50/90 p-1.5 shadow-sm">
          <>
            <TabsTrigger value="my-requests" className="flex-1 rounded-xl px-4 py-2 text-sm font-semibold transition-all data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=inactive]:text-slate-600">
              My Requests ({staffRequests.length})
            </TabsTrigger>
            <TabsTrigger value="approved" className="flex-1 rounded-xl px-4 py-2 text-sm font-semibold transition-all data-[state=active]:bg-emerald-600 data-[state=active]:text-white data-[state=inactive]:text-emerald-700">
              Approved ({approvedRequests.length})
            </TabsTrigger>
            {isManagerView && (
              <>
              <TabsTrigger value="pending-approvals" className="flex-1 rounded-xl px-4 py-2 text-sm font-semibold transition-all data-[state=active]:bg-amber-500 data-[state=active]:text-white data-[state=inactive]:text-amber-700">
                Pending ({pendingNotifications.length})
              </TabsTrigger>
              {isAdminView && (
                <>
                  <TabsTrigger value="role-staff" className="flex-1 rounded-xl px-4 py-2 text-sm font-semibold transition-all data-[state=active]:bg-sky-600 data-[state=active]:text-white data-[state=inactive]:text-sky-700">
                    Staff ({adminStaffQueue.length})
                  </TabsTrigger>
                  <TabsTrigger value="role-hod" className="flex-1 rounded-xl px-4 py-2 text-sm font-semibold transition-all data-[state=active]:bg-violet-600 data-[state=active]:text-white data-[state=inactive]:text-violet-700">
                    HOD ({adminHodQueue.length})
                  </TabsTrigger>
                  <TabsTrigger value="role-regional" className="flex-1 rounded-xl px-4 py-2 text-sm font-semibold transition-all data-[state=active]:bg-indigo-600 data-[state=active]:text-white data-[state=inactive]:text-indigo-700">
                    Regional ({adminRegionalQueue.length})
                  </TabsTrigger>
                  <TabsTrigger value="delayed" className="flex-1 rounded-xl px-4 py-2 text-sm font-semibold transition-all data-[state=active]:bg-rose-600 data-[state=active]:text-white data-[state=inactive]:text-rose-700">
                    Delayed {`>=${inactivityDays}d`} ({adminDelayedQueue.length})
                  </TabsTrigger>
                </>
              )}
              <TabsTrigger value="history" className="flex-1 rounded-xl px-4 py-2 text-sm font-semibold transition-all data-[state=active]:bg-slate-700 data-[state=active]:text-white data-[state=inactive]:text-slate-600">
                History
              </TabsTrigger>
              </>
            )}
          </>
        </TabsList>

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
                    <LeaveRequestCard key={request.id} request={request} canEdit={editableStatuses.has(String(request.status || ""))} onEdit={() => openEditRequest(request)} />
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

        {isManagerView && (
          <>
            <TabsContent value="pending-approvals" className="space-y-4">
              <Alert className="border-amber-200 bg-amber-50">
                <AlertDescription>
                  Requests pending for {inactivityDays} days or more are marked as delayed and should be actioned immediately to avoid automatic supervisor timeout approvals.
                </AlertDescription>
              </Alert>
              {renderManagerNotifications(adminAllPending, "No pending leave requests to approve")}
            </TabsContent>

            {isAdminView && (
              <>
                <TabsContent value="role-staff" className="space-y-4">
                  {renderManagerNotifications(adminStaffQueue, "No staff queue requests pending")}
                </TabsContent>
                <TabsContent value="role-hod" className="space-y-4">
                  {renderManagerNotifications(adminHodQueue, "No HOD queue requests pending")}
                </TabsContent>
                <TabsContent value="role-regional" className="space-y-4">
                  {renderManagerNotifications(adminRegionalQueue, "No regional queue requests pending")}
                </TabsContent>
                <TabsContent value="delayed" className="space-y-4">
                  {renderManagerNotifications(adminDelayedQueue, `No delayed requests at or above ${inactivityDays} days`)}
                </TabsContent>
              </>
            )}

            <TabsContent value="history" className="space-y-4">
              <Alert className="border-slate-200 bg-white shadow-sm">
                <AlertDescription>Historical leave request data will be surfaced here when the archive view is enabled.</AlertDescription>
              </Alert>
            </TabsContent>
          </>
        )}
      </Tabs>

      <Dialog open={Boolean(editingRequest)} onOpenChange={(open) => { if (!open) closeEditDialog() }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Leave Request</DialogTitle>
            <DialogDescription>
              You can update this request only before HOD/manager review starts.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit_leave_type">Leave Type</Label>
              <Input id="edit_leave_type" value={editLeaveType} onChange={(e) => setEditLeaveType(e.target.value)} placeholder="annual" />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="edit_start_date">Start Date</Label>
                <Input id="edit_start_date" type="date" value={editStartDate} onChange={(e) => setEditStartDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit_end_date">End Date</Label>
                <Input id="edit_end_date" type="date" value={editEndDate} onChange={(e) => setEditEndDate(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit_reason">Reason</Label>
              <Textarea id="edit_reason" rows={4} value={editReason} onChange={(e) => setEditReason(e.target.value)} placeholder="Provide reason for leave" />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeEditDialog}>Cancel</Button>
            <Button onClick={handleUpdateLeaveRequest}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
  canEdit = false,
  onEdit,
}: {
  request: LeaveRequest
  emphasizeApproved?: boolean
  canEdit?: boolean
  onEdit?: () => void
}) {
  const normalizedStatus = String(request.status || "").toLowerCase()
  const isApproved = ["approved", "hr_approved"].includes(normalizedStatus)
  const isPending = ["pending", "pending_hod", "pending_hr", "pending_manager_review", "manager_confirmed"].includes(normalizedStatus)

  const statusTone =
    isApproved
      ? "border-emerald-200 bg-emerald-50/60"
      : isPending
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
          <Badge className={isApproved ? "bg-emerald-600 text-white hover:bg-emerald-600" : isPending ? "border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-50" : "bg-rose-600 text-white hover:bg-rose-600"}>
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
        {canEdit && onEdit && (
          <Button variant="outline" size="sm" onClick={onEdit} className="w-full">
            Edit Before Review
          </Button>
        )}
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
