"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Calendar,
  CheckCircle2,
  Clock,
  AlertCircle,
  Upload,
  XCircle,
  CalendarDays,
  Timer,
} from "lucide-react"
import { LeaveRequestDialog, LeaveRequestData } from "./leave-request-dialog"
import { differenceInCalendarDays, format } from "date-fns"

interface LeaveStatusCardProps {
  leaveStatus: "active" | "pending" | "rejected" | "approved" | "on_leave" | "sick_leave" | null
  leaveStartDate: string | null
  leaveEndDate: string | null
  leaveReason: string | null
  onRequestLeave: () => void
}

export function LeaveStatusCard({
  leaveStatus,
  leaveStartDate,
  leaveEndDate,
  leaveReason,
  onRequestLeave,
}: LeaveStatusCardProps) {
  const [showDialog, setShowDialog] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const startDate = leaveStartDate ? new Date(leaveStartDate) : null
  const endDate = leaveEndDate ? new Date(leaveEndDate) : null

  const isCurrentlyOnLeave =
    (leaveStatus === "on_leave" || leaveStatus === "sick_leave") ||
    (startDate && endDate && today >= startDate && today <= endDate)

  const totalDays = startDate && endDate
    ? differenceInCalendarDays(endDate, startDate) + 1
    : null
  const daysRemaining = endDate
    ? Math.max(0, differenceInCalendarDays(endDate, today) + 1)
    : null

  const handleSubmitApprovedLeave = async (data: LeaveRequestData) => {
    setIsSubmitting(true)
    try {
      const formData = new FormData()
      formData.append("startDate", data.startDate.toISOString())
      formData.append("endDate", data.endDate.toISOString())
      formData.append("reason", data.reason)
      formData.append("leaveType", data.leaveType)
      if (data.documentFile) formData.append("document", data.documentFile)
      const response = await fetch("/api/leave/activate", { method: "POST", body: formData })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to submit leave")
      }
      window.location.reload()
    } catch (error) {
      console.error("[v0] Error submitting leave:", error)
      alert(error instanceof Error ? error.message : "Failed to submit leave")
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!leaveStatus || leaveStatus === "active" || (leaveStatus === "rejected" && !startDate)) {
    return null
  }

  // ── ON LEAVE ──────────────────────────────────────────────────────────────
  if (isCurrentlyOnLeave) {
    return (
      <Card className="overflow-hidden border-0 shadow-md">
        <div className="h-1.5 w-full bg-emerald-500" />
        <CardContent className="p-5 space-y-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-emerald-100 dark:bg-emerald-900/30 p-2.5">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="font-semibold text-sm text-foreground">Currently On Leave</p>
                <p className="text-xs text-muted-foreground">Attendance suspended for this period</p>
              </div>
            </div>
            <Badge className="bg-emerald-600 text-white shrink-0">Active</Badge>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-muted/50 border py-3">
              <p className="text-xs text-muted-foreground mb-1">Start</p>
              <p className="font-semibold text-sm">{startDate ? format(startDate, "dd MMM") : "—"}</p>
            </div>
            <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700 py-3">
              <p className="text-xs text-muted-foreground mb-1">Days Left</p>
              <p className="font-bold text-lg text-emerald-700 dark:text-emerald-400">{daysRemaining ?? "—"}</p>
            </div>
            <div className="rounded-xl bg-muted/50 border py-3">
              <p className="text-xs text-muted-foreground mb-1">End</p>
              <p className="font-semibold text-sm">{endDate ? format(endDate, "dd MMM") : "—"}</p>
            </div>
          </div>

          {leaveReason && (
            <div className="rounded-xl bg-muted/40 border px-4 py-3">
              <p className="text-xs text-muted-foreground mb-1">Reason</p>
              <p className="text-sm line-clamp-2">{leaveReason}</p>
            </div>
          )}

          <div className="flex items-start gap-2 text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700 rounded-xl px-3 py-2.5">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            Your department head has been notified. Check-in is disabled during leave.
          </div>
        </CardContent>
      </Card>
    )
  }

  // ── APPROVED — awaiting document ─────────────────────────────────────────
  if (leaveStatus === "approved" && startDate && endDate) {
    return (
      <>
        <Card className="overflow-hidden border-0 shadow-md">
          <div className="h-1.5 w-full bg-blue-500" />
          <CardContent className="p-5 space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-blue-100 dark:bg-blue-900/30 p-2.5">
                  <CheckCircle2 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="font-semibold text-sm text-foreground">Leave Approved</p>
                  <p className="text-xs text-muted-foreground">Upload document to activate</p>
                </div>
              </div>
              <Badge className="bg-blue-600 text-white shrink-0">Approved</Badge>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-muted/50 border py-3">
                <p className="text-xs text-muted-foreground mb-1">Start</p>
                <p className="font-semibold text-sm">{format(startDate, "dd MMM")}</p>
              </div>
              <div className="rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 py-3">
                <p className="text-xs text-muted-foreground mb-1">Duration</p>
                <p className="font-bold text-lg text-blue-700 dark:text-blue-400">{totalDays}d</p>
              </div>
              <div className="rounded-xl bg-muted/50 border py-3">
                <p className="text-xs text-muted-foreground mb-1">End</p>
                <p className="font-semibold text-sm">{format(endDate, "dd MMM")}</p>
              </div>
            </div>

            <Button
              onClick={() => setShowDialog(true)}
              className="w-full bg-blue-600 hover:bg-blue-700"
              disabled={isSubmitting}
            >
              <Upload className="mr-2 h-4 w-4" />
              {isSubmitting ? "Submitting…" : "Upload Document & Activate"}
            </Button>
          </CardContent>
        </Card>
        <LeaveRequestDialog
          open={showDialog}
          onOpenChange={setShowDialog}
          staffName="Your Leave"
          hasApprovedLeave={true}
          onSubmit={handleSubmitApprovedLeave}
        />
      </>
    )
  }

  // ── PENDING ───────────────────────────────────────────────────────────────
  if (leaveStatus === "pending" && startDate && endDate) {
    return (
      <Card className="overflow-hidden border-0 shadow-md">
        <div className="h-1.5 w-full bg-amber-500" />
        <CardContent className="p-5 space-y-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-amber-100 dark:bg-amber-900/30 p-2.5">
                <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="font-semibold text-sm text-foreground">Pending Approval</p>
                <p className="text-xs text-muted-foreground">Awaiting HOD review</p>
              </div>
            </div>
            <Badge className="bg-amber-500 text-white shrink-0">Pending</Badge>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-muted/50 border py-3">
              <p className="text-xs text-muted-foreground mb-1">Start</p>
              <p className="font-semibold text-sm">{format(startDate, "dd MMM")}</p>
            </div>
            <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 py-3">
              <p className="text-xs text-muted-foreground mb-1">Duration</p>
              <p className="font-bold text-lg text-amber-700 dark:text-amber-400">{totalDays}d</p>
            </div>
            <div className="rounded-xl bg-muted/50 border py-3">
              <p className="text-xs text-muted-foreground mb-1">End</p>
              <p className="font-semibold text-sm">{format(endDate, "dd MMM")}</p>
            </div>
          </div>

          {leaveReason && (
            <div className="rounded-xl bg-muted/40 border px-4 py-3">
              <p className="text-xs text-muted-foreground mb-1">Reason</p>
              <p className="text-sm line-clamp-2">{leaveReason}</p>
            </div>
          )}

          <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl px-3 py-2.5">
            <Timer className="h-3.5 w-3.5 shrink-0" />
            Your HOD will review and respond soon.
          </div>
        </CardContent>
      </Card>
    )
  }

  // ── REJECTED ──────────────────────────────────────────────────────────────
  if (leaveStatus === "rejected") {
    return (
      <Card className="overflow-hidden border-0 shadow-md">
        <div className="h-1.5 w-full bg-red-500" />
        <CardContent className="p-5 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-red-100 dark:bg-red-900/30 p-2.5">
                <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <p className="font-semibold text-sm text-foreground">Request Not Approved</p>
                <p className="text-xs text-muted-foreground">You may submit a new request</p>
              </div>
            </div>
            <Badge variant="destructive" className="shrink-0">Rejected</Badge>
          </div>
          <Button onClick={onRequestLeave} variant="outline" className="w-full">
            <CalendarDays className="mr-2 h-4 w-4" />
            Submit New Request
          </Button>
        </CardContent>
      </Card>
    )
  }

  return null
}


interface LeaveStatusCardProps {
  leaveStatus: "active" | "pending" | "rejected" | "approved" | "on_leave" | "sick_leave" | null
  leaveStartDate: string | null
  leaveEndDate: string | null
  leaveReason: string | null
  onRequestLeave: () => void
}

export function LeaveStatusCard({
  leaveStatus,
  leaveStartDate,
  leaveEndDate,
  leaveReason,
  onRequestLeave,
}: LeaveStatusCardProps) {
  const [showDialog, setShowDialog] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Check if user is currently on leave
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const startDate = leaveStartDate ? new Date(leaveStartDate) : null
  const endDate = leaveEndDate ? new Date(leaveEndDate) : null

  // User is on leave if:
  // 1. leave_status is "on_leave" or "sick_leave", OR
  // 2. they have leave dates and today is within that range
  // Note: leave_status "active" means working at post, NOT on leave
  const isCurrentlyOnLeave =
    (leaveStatus === "on_leave" || leaveStatus === "sick_leave") ||
    (startDate && endDate && today >= startDate && today <= endDate)

  const handleSubmitApprovedLeave = async (data: LeaveRequestData) => {
    setIsSubmitting(true)
    try {
      const formData = new FormData()
      formData.append("startDate", data.startDate.toISOString())
      formData.append("endDate", data.endDate.toISOString())
      formData.append("reason", data.reason)
      formData.append("leaveType", data.leaveType)
      if (data.documentFile) {
        formData.append("document", data.documentFile)
      }

      // Call server-side API to handle leave submission with Supabase updates
      const response = await fetch("/api/leave/activate", {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to submit leave")
      }

      // Refresh page to show updated leave status
      window.location.reload()
    } catch (error) {
      console.error("[v0] Error submitting leave:", error)
      alert(error instanceof Error ? error.message : "Failed to submit leave")
    } finally {
      setIsSubmitting(false)
    }
  }

  // Show nothing if user is working normally (no leave request or dates)
  if (!leaveStatus || leaveStatus === "active" || (leaveStatus === "rejected" && !startDate)) {
    return null
  }

  // Currently on approved leave
  if (isCurrentlyOnLeave) {
    return (
      <Card className="border-2 border-green-200 bg-gradient-to-br from-green-50 to-emerald-50 shadow-lg">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2 text-green-900">
              <CheckCircle2 className="w-5 h-5" />
              Currently On Approved Leave
            </CardTitle>
            <Badge className="bg-green-600 hover:bg-green-700">Active</Badge>
          </div>
          <CardDescription className="text-green-700">
            Attendance is not required during this period
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 bg-white/50 rounded-lg border border-green-100">
              <p className="text-xs text-muted-foreground mb-1">Start Date</p>
              <p className="font-semibold">{startDate?.toLocaleDateString()}</p>
            </div>
            <div className="p-3 bg-white/50 rounded-lg border border-green-100">
              <p className="text-xs text-muted-foreground mb-1">End Date</p>
              <p className="font-semibold">{endDate?.toLocaleDateString()}</p>
            </div>
          </div>

          {leaveReason && (
            <div className="p-3 bg-white/50 rounded-lg border border-green-100">
              <p className="text-xs text-muted-foreground mb-1">Reason</p>
              <p className="text-sm">{leaveReason}</p>
            </div>
          )}

          <div className="flex items-start gap-2 p-3 bg-white/50 rounded-lg border border-green-100">
            <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-green-900">
              Your leave is active. Your department head has been notified. Check-in/check-out is disabled during this period.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Leave approved but not yet submitted with document
  if (leaveStatus === "approved" && startDate && endDate) {
    return (
      <>
        <Card className="border-2 border-blue-200 bg-gradient-to-br from-blue-50 to-cyan-50 shadow-md">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2 text-blue-900">
                <CheckCircle2 className="w-5 h-5" />
                Leave Approved
              </CardTitle>
              <Badge className="bg-blue-600 hover:bg-blue-700">Approved</Badge>
            </div>
            <CardDescription className="text-blue-700">
              Submit your document to activate the leave immediately
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-white/50 rounded-lg border border-blue-100">
                <p className="text-xs text-muted-foreground mb-1">Start Date</p>
                <p className="font-semibold">{startDate?.toLocaleDateString()}</p>
              </div>
              <div className="p-3 bg-white/50 rounded-lg border border-blue-100">
                <p className="text-xs text-muted-foreground mb-1">End Date</p>
                <p className="font-semibold">{endDate?.toLocaleDateString()}</p>
              </div>
            </div>

            {leaveReason && (
              <div className="p-3 bg-white/50 rounded-lg border border-blue-100">
                <p className="text-xs text-muted-foreground mb-1">Reason</p>
                <p className="text-sm">{leaveReason}</p>
              </div>
            )}

            <Alert className="bg-blue-100 border-blue-300">
              <Upload className="h-4 w-4 text-blue-600" />
              <AlertDescription className="text-blue-800 font-medium">
                Upload your supporting document (approval letter, medical certificate, etc.) to activate the leave.
              </AlertDescription>
            </Alert>

            <Button
              onClick={() => setShowDialog(true)}
              className="w-full bg-blue-600 hover:bg-blue-700"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Submitting..." : "Submit Leave with Document"}
            </Button>
          </CardContent>
        </Card>

        <LeaveRequestDialog
          open={showDialog}
          onOpenChange={setShowDialog}
          staffName="Your Leave"
          hasApprovedLeave={true}
          onSubmit={handleSubmitApprovedLeave}
        />
      </>
    )
  }

  // Pending leave request (awaiting HOD approval)
  if (leaveStatus === "pending" && startDate && endDate) {
    return (
      <Card className="border-2 border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2 text-amber-900">
              <Clock className="w-5 h-5" />
              Leave Request Pending
            </CardTitle>
            <Badge className="bg-amber-600 hover:bg-amber-700">Pending</Badge>
          </div>
          <CardDescription className="text-amber-700">Awaiting HOD approval</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 bg-white/50 rounded-lg border border-amber-100">
              <p className="text-xs text-muted-foreground mb-1">Start Date</p>
              <p className="font-semibold">{startDate?.toLocaleDateString()}</p>
            </div>
            <div className="p-3 bg-white/50 rounded-lg border border-amber-100">
              <p className="text-xs text-muted-foreground mb-1">End Date</p>
              <p className="font-semibold">{endDate?.toLocaleDateString()}</p>
            </div>
          </div>

          {leaveReason && (
            <div className="p-3 bg-white/50 rounded-lg border border-amber-100">
              <p className="text-xs text-muted-foreground mb-1">Reason</p>
              <p className="text-sm">{leaveReason}</p>
            </div>
          )}

          <div className="flex items-start gap-2 p-3 bg-white/50 rounded-lg border border-amber-100">
            <Clock className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-amber-900">Your HOD will review and respond to this request soon.</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Rejected leave request
  if (leaveStatus === "rejected") {
    return (
      <Card className="border-2 border-red-200 bg-gradient-to-br from-red-50 to-pink-50">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2 text-red-900">
              <AlertCircle className="w-5 h-5" />
              Leave Request Rejected
            </CardTitle>
            <Badge variant="destructive">Rejected</Badge>
          </div>
          <CardDescription className="text-red-700">Your leave request was not approved</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={onRequestLeave} variant="outline" className="w-full bg-transparent">
            Submit New Request
          </Button>
        </CardContent>
      </Card>
    )
  }

  return null
}
