"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { AlertCircle, Calendar, Clock, CheckCircle2, XCircle, Send } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

function fmtDate(val?: string | null) {
  if (!val) return "—"
  const dt = new Date(val)
  if (Number.isNaN(dt.getTime())) return String(val)
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

interface DefermentRequest {
  id: string
  leave_plan_request_id: string
  user_id: string
  requested_deferment_year: string
  requested_deferment_period: string
  reason?: string
  status: string
  hod_reviewer?: { full_name: string }
  hod_decision?: string
  hod_notes?: string
  hod_reviewed_at?: string
  hr_office_reviewer?: { full_name: string }
  hr_office_decision?: string
  hr_office_notes?: string
  hr_office_reviewed_at?: string
  leave_plan_requests?: any
  created_at: string
}

interface LeaveRequest {
  id: string
  leave_type_key: string
  preferred_start_date: string
  preferred_end_date: string
  requested_days: number
  status: string
}

interface LeaveDefermentClientProps {
  userRole: string | null
}

function normalizeRole(role: string | null | undefined) {
  return String(role || "").toLowerCase().trim().replace(/[-\s]+/g, "_")
}

function getStatusColor(status: string) {
  const colorMap: Record<string, string> = {
    pending_hod_review: "bg-blue-100 text-blue-800 border-blue-300",
    hod_approved: "bg-green-100 text-green-800 border-green-300",
    hod_rejected: "bg-red-100 text-red-800 border-red-300",
    hod_changes_requested: "bg-amber-100 text-amber-800 border-amber-300",
    hr_office_approved: "bg-emerald-100 text-emerald-800 border-emerald-300",
    hr_office_rejected: "bg-rose-100 text-rose-800 border-rose-300",
    completed: "bg-teal-100 text-teal-800 border-teal-300",
  }
  return colorMap[status] || "bg-slate-100 text-slate-800 border-slate-300"
}

function getStatusLabel(status: string) {
  const labelMap: Record<string, string> = {
    pending_hod_review: "Pending HOD Review",
    hod_approved: "Approved by HOD",
    hod_rejected: "Rejected by HOD",
    hod_changes_requested: "Changes Requested",
    hr_office_approved: "HR Office Approved",
    hr_office_rejected: "HR Office Rejected",
    completed: "Completed",
  }
  return labelMap[status] || status
}

export function LeaveDefermentClient({ userRole }: LeaveDefermentClientProps) {
  const { toast } = useToast()
  const roleNorm = normalizeRole(userRole)
  const isStaff = !["admin", "leave_admin", "hr_office", "hr_leave_office", "director_hr", "manager_hr"].includes(roleNorm)
  const isHrOffice = ["admin", "leave_admin", "hr_office", "hr_leave_office", "director_hr", "manager_hr"].includes(roleNorm)

  const [approvedLeaves, setApprovedLeaves] = useState<LeaveRequest[]>([])
  const [deferments, setDeferments] = useState<DefermentRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [selectedLeaveId, setSelectedLeaveId] = useState<string | null>(null)
  const [defermentYear, setDefermentYear] = useState("")
  const [defermentPeriod, setDefermentPeriod] = useState("")
  const [reason, setReason] = useState("")

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)

      // Get approved leaves (only for staff)
      if (isStaff) {
        const res = await fetch("/api/leave/deferment/request?action=approved_leaves")
        const data = await res.json()
        setApprovedLeaves(data.requests || [])
      }

      // Get deferment requests
      const deferRes = await fetch("/api/leave/deferment/request")
      const deferData = await deferRes.json()
      setDeferments(deferData.deferments || [])
    } catch (error) {
      toast({ title: "Error", description: "Failed to load data", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  const handleSubmitDeferment = async (leaveId: string) => {
    if (!defermentYear || !defermentPeriod) {
      toast({ title: "Error", description: "Please fill in all required fields" })
      return
    }

    try {
      setSubmitting(true)
      const res = await fetch("/api/leave/deferment/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leave_plan_request_id: leaveId,
          requested_deferment_year: defermentYear,
          requested_deferment_period: defermentPeriod,
          reason: reason || null,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to submit")

      toast({ title: "Success", description: "Deferment request submitted" })
      setSelectedLeaveId(null)
      setDefermentYear("")
      setDefermentPeriod("")
      setReason("")
      await loadData()
    } catch (error) {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Failed", variant: "destructive" })
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <div className="text-center py-8 text-slate-600">Loading deferment information...</div>
  }

  return (
    <div className="space-y-6">
      {/* Staff Section - Submit Deferment */}
      {isStaff && (
        <>
          <Alert className="border-blue-300 bg-blue-50">
            <AlertCircle className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-blue-800">
              You can defer your approved leave to a future leave year. Select an approved leave request and specify when you'd like to defer it to.
            </AlertDescription>
          </Alert>

          {approvedLeaves.length === 0 ? (
            <Card className="border-amber-200 bg-amber-50">
              <CardContent className="pt-6 text-center">
                <AlertCircle className="h-8 w-8 mx-auto mb-2 text-amber-600" />
                <p className="text-amber-800 font-medium">No Approved Leave Requests</p>
                <p className="text-amber-700 text-sm mt-1">
                  You can only defer leave requests that have been approved by HR. Once your leave is approved, you'll be able to defer it here.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              <p className="text-sm font-medium text-slate-700">
                Approved Leave Requests ({approvedLeaves.length})
              </p>
              <div className="grid gap-4">
                {approvedLeaves.map((leave) => (
                  <Card key={leave.id} className="border-emerald-200">
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="font-semibold text-slate-900">{leave.leave_type_key}</span>
                            <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300">Approved</Badge>
                          </div>
                          <div className="text-sm text-slate-600 space-y-1">
                            <p className="flex items-center gap-2">
                              <Calendar className="w-4 h-4" />
                              {fmtDate(leave.preferred_start_date)} to {fmtDate(leave.preferred_end_date)}
                            </p>
                            <p className="flex items-center gap-2">
                              <Clock className="w-4 h-4" />
                              {leave.requested_days} days
                            </p>
                          </div>
                        </div>

                        {deferments.find((d) => d.leave_plan_request_id === leave.id) ? (
                          <div className="text-right">
                            <Badge className="bg-blue-100 text-blue-800">Deferment Pending</Badge>
                          </div>
                        ) : (
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button
                                onClick={() => setSelectedLeaveId(leave.id)}
                                className="bg-blue-600 hover:bg-blue-700"
                              >
                                <Send className="w-4 h-4 mr-2" /> Defer Leave
                              </Button>
                            </DialogTrigger>
                            {selectedLeaveId === leave.id && (
                              <DialogContent className="sm:max-w-[500px]">
                                <DialogHeader>
                                  <DialogTitle>Defer Leave Request</DialogTitle>
                                  <DialogDescription>
                                    Propose a new leave year and period for your leave
                                  </DialogDescription>
                                </DialogHeader>
                                <div className="space-y-4 py-4">
                                  <div>
                                    <Label htmlFor="year">Deferment Year</Label>
                                    <Input
                                      id="year"
                                      placeholder="e.g., 2027"
                                      value={defermentYear}
                                      onChange={(e) => setDefermentYear(e.target.value)}
                                      className="mt-1.5"
                                    />
                                  </div>

                                  <div>
                                    <Label htmlFor="period">Deferment Period</Label>
                                    <Input
                                      id="period"
                                      placeholder="e.g., Q1 2027 or January 2027"
                                      value={defermentPeriod}
                                      onChange={(e) => setDefermentPeriod(e.target.value)}
                                      className="mt-1.5"
                                    />
                                  </div>

                                  <div>
                                    <Label htmlFor="reason">Reason (Optional)</Label>
                                    <Textarea
                                      id="reason"
                                      placeholder="Why you're deferring this leave..."
                                      value={reason}
                                      onChange={(e) => setReason(e.target.value)}
                                      className="mt-1.5 resize-none"
                                      rows={3}
                                    />
                                  </div>

                                  <div className="flex gap-2 pt-4">
                                    <Button
                                      onClick={() => handleSubmitDeferment(leave.id)}
                                      disabled={submitting}
                                      className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                                    >
                                      {submitting ? "Submitting..." : "Submit Deferment"}
                                    </Button>
                                  </div>
                                </div>
                              </DialogContent>
                            )}
                          </Dialog>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Deferment Requests Summary */}
      <div className="space-y-4">
        <p className="text-sm font-medium text-slate-700">
          {isStaff ? "Your Deferment Requests" : "Deferment Requests"} ({deferments.length})
        </p>

        {deferments.length === 0 ? (
          <Card className="border-slate-200">
            <CardContent className="pt-6 text-center text-slate-600">
              No deferment requests yet
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {deferments.map((deferment) => (
              <Card key={deferment.id} className="border-slate-200">
                <CardContent className="pt-6">
                  <div className="space-y-4">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-semibold text-slate-900">
                          Defer to: {deferment.requested_deferment_period}
                        </p>
                        <p className="text-sm text-slate-600 mt-1">
                          Submitted: {fmtDate(deferment.created_at)}
                        </p>
                      </div>
                      <Badge className={`border ${getStatusColor(deferment.status)}`}>
                        {getStatusLabel(deferment.status)}
                      </Badge>
                    </div>

                    {/* Reason */}
                    {deferment.reason && (
                      <div className="bg-slate-50 p-3 rounded border border-slate-200">
                        <p className="text-xs font-medium text-slate-600 uppercase mb-1">Reason</p>
                        <p className="text-sm text-slate-700">{deferment.reason}</p>
                      </div>
                    )}

                    {/* HOD Review */}
                    {deferment.hod_reviewed_at && (
                      <div className={`p-3 rounded border ${deferment.hod_decision === 'approved' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                        <p className="text-xs font-medium text-slate-600 uppercase mb-1">HOD Decision</p>
                        <p className="text-sm font-medium text-slate-900 flex items-center gap-2">
                          {deferment.hod_decision === 'approved' ? (
                            <CheckCircle2 className="w-4 h-4 text-green-600" />
                          ) : (
                            <XCircle className="w-4 h-4 text-red-600" />
                          )}
                          {deferment.hod_decision === 'approved' ? 'Approved' : 'Rejected'}
                        </p>
                        {deferment.hod_notes && (
                          <p className="text-sm text-slate-700 mt-2">{deferment.hod_notes}</p>
                        )}
                      </div>
                    )}

                    {/* HR Leave Office Review */}
                    {deferment.hr_office_reviewed_at && (
                      <div className={`p-3 rounded border ${deferment.hr_office_decision === 'approved' ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
                        <p className="text-xs font-medium text-slate-600 uppercase mb-1">HR Leave Office Decision</p>
                        <p className="text-sm font-medium text-slate-900 flex items-center gap-2">
                          {deferment.hr_office_decision === 'approved' ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          ) : (
                            <XCircle className="w-4 h-4 text-rose-600" />
                          )}
                          {deferment.hr_office_decision === 'approved' ? 'Approved' : 'Rejected'}
                        </p>
                        {deferment.hr_office_notes && (
                          <p className="text-sm text-slate-700 mt-2">{deferment.hr_office_notes}</p>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
