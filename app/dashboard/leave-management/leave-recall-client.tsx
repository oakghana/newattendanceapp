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
import { AlertTriangle, Calendar, Phone, CheckCircle2, XCircle, Send } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

function fmtDate(val?: string | null) {
  if (!val) return "—"
  const dt = new Date(val)
  if (Number.isNaN(dt.getTime())) return String(val)
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

interface OnLeaveStaff {
  id: string
  user_id: string
  leave_plan_request_id: string
  leave_type_key: string
  preferred_start_date: string
  preferred_end_date: string
  requested_days: number
  status: string
  staff_name: string
  department: string
}

interface RecallRequest {
  id: string
  user_id: string
  leave_plan_request_id: string
  recall_date: string
  reason: string
  status: string
  leave_start_date?: string
  leave_end_date?: string
  requested_by_name?: string
  created_at: string
}

interface LeaveRecallClientProps {
  userRole: string | null
}

function normalizeRole(role: string | null | undefined) {
  return String(role || "").toLowerCase().trim().replace(/[-\s]+/g, "_")
}

function getStatusColor(status: string) {
  const colorMap: Record<string, string> = {
    pending_hod_review: "bg-blue-100 text-blue-800 border-blue-300",
    pending_hr_review: "bg-amber-100 text-amber-800 border-amber-300",
    hr_approved: "bg-green-100 text-green-800 border-green-300",
    hr_rejected: "bg-red-100 text-red-800 border-red-300",
    completed: "bg-teal-100 text-teal-800 border-teal-300",
  }
  return colorMap[status] || "bg-slate-100 text-slate-800 border-slate-300"
}

function getStatusLabel(status: string) {
  const labelMap: Record<string, string> = {
    pending_hod_review: "Pending HOD Review",
    pending_hr_review: "Pending HR Review",
    hr_approved: "HR Approved",
    hr_rejected: "HR Rejected",
    completed: "Completed",
  }
  return labelMap[status] || status
}

export function LeaveRecallClient({ userRole }: LeaveRecallClientProps) {
  const { toast } = useToast()
  const roleNorm = normalizeRole(userRole)
  const isHod = ["hod", "head_of_department", "head_department", "manager", "department_head", "regional_manager", "rm"].includes(roleNorm)
  const isHrOffice = ["admin", "leave_admin", "hr_office", "hr_leave_office", "director_hr", "manager_hr"].includes(roleNorm)
  const canRecall = isHod || isHrOffice

  const [onLeaveStaff, setOnLeaveStaff] = useState<OnLeaveStaff[]>([])
  const [recalls, setRecalls] = useState<RecallRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [selectedStaff, setSelectedStaff] = useState<string | null>(null)
  const [recallDate, setRecallDate] = useState("")
  const [reason, setReason] = useState("")
  const [searchText, setSearchText] = useState("")

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)

      // Get staff currently on leave
      if (canRecall) {
        const res = await fetch("/api/leave/active-leaves")
        const data = await res.json()
        setOnLeaveStaff(data.leaves || [])
      }

      // Get all recall requests
      const recallRes = await fetch("/api/leave/recall/list")
      const recallData = await recallRes.json()
      setRecalls(recallData.recalls || [])
    } catch (error) {
      console.error("[v0] Error loading recall data:", error)
      toast({ title: "Error", description: "Failed to load recall data", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  const handleSubmitRecall = async () => {
    if (!selectedStaff || !recallDate) {
      toast({ title: "Error", description: "Please select staff member and recall date" })
      return
    }

    const staff = onLeaveStaff.find(s => s.id === selectedStaff)
    if (!staff) {
      toast({ title: "Error", description: "Staff member not found" })
      return
    }

    try {
      setSubmitting(true)
      const res = await fetch("/api/leave/recall/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leaveStartDate: staff.preferred_start_date,
          leaveEndDate: staff.preferred_end_date,
          recallDate: recallDate,
          reason: reason || "Staff recall from leave",
          leaveRequestId: staff.leave_plan_request_id,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to submit recall")

      toast({ title: "Success", description: "Recall request submitted to HR Leave Office" })
      setSelectedStaff(null)
      setRecallDate("")
      setReason("")
      loadData()
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to submit recall request",
        variant: "destructive",
      })
    } finally {
      setSubmitting(false)
    }
  }

  const filteredStaff = onLeaveStaff.filter(s =>
    s.staff_name.toLowerCase().includes(searchText.toLowerCase()) ||
    s.department.toLowerCase().includes(searchText.toLowerCase())
  )

  const filteredRecalls = recalls.filter(r =>
    r.reason.toLowerCase().includes(searchText.toLowerCase()) ||
    (r.requested_by_name || "").toLowerCase().includes(searchText.toLowerCase())
  )

  if (loading) {
    return <div className="text-center py-8 text-slate-600">Loading recall information...</div>
  }

  if (!canRecall) {
    return (
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>You don&apos;t have permission to manage leave recalls. Only HOD/RM and HR Leave Office can request recalls.</AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-6">
      {/* Search */}
      <div className="flex gap-2">
        <Input
          placeholder="Search staff or recalls..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          className="flex-1"
        />
      </div>

      {/* Staff on Leave Section */}
      <Card className="border-blue-200 bg-blue-50/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5 text-blue-600" />
            Staff on Leave ({filteredStaff.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {filteredStaff.length === 0 ? (
            <p className="text-slate-600">No staff currently on leave</p>
          ) : (
            <div className="space-y-3">
              {filteredStaff.map(staff => (
                <Card key={staff.id} className="border-l-4 border-l-blue-500">
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <h4 className="font-semibold text-slate-900">{staff.staff_name}</h4>
                        <p className="text-sm text-slate-600">{staff.department}</p>
                        <p className="text-sm text-slate-700 mt-1">
                          {staff.leave_type_key} Leave: {fmtDate(staff.preferred_start_date)} - {fmtDate(staff.preferred_end_date)}
                        </p>
                        <p className="text-sm text-slate-600">
                          Duration: {staff.requested_days} days
                        </p>
                      </div>
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button
                            onClick={() => {
                              setSelectedStaff(staff.id)
                              setRecallDate("")
                              setReason("")
                            }}
                            className="bg-red-600 hover:bg-red-700 text-white"
                          >
                            <Phone className="h-4 w-4 mr-2" />
                            Recall
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Recall Staff from Leave</DialogTitle>
                            <DialogDescription>
                              Request to recall {staff.staff_name} from leave. This will be submitted to HR Leave Office for processing.
                            </DialogDescription>
                          </DialogHeader>
                          <div className="space-y-4">
                            <div>
                              <Label>Leave Period</Label>
                              <p className="text-sm text-slate-600">
                                {fmtDate(staff.preferred_start_date)} - {fmtDate(staff.preferred_end_date)}
                              </p>
                            </div>
                            <div>
                              <Label htmlFor="recall-date">Recall Date*</Label>
                              <Input
                                id="recall-date"
                                type="date"
                                value={recallDate}
                                onChange={(e) => setRecallDate(e.target.value)}
                                min={staff.preferred_start_date}
                                max={staff.preferred_end_date}
                              />
                            </div>
                            <div>
                              <Label htmlFor="recall-reason">Reason for Recall*</Label>
                              <Textarea
                                id="recall-reason"
                                placeholder="Explain why staff needs to be recalled..."
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                rows={3}
                              />
                            </div>
                            <div className="flex gap-3 pt-4">
                              <Button
                                variant="outline"
                                onClick={() => setSelectedStaff(null)}
                              >
                                Cancel
                              </Button>
                              <Button
                                onClick={handleSubmitRecall}
                                disabled={submitting || !recallDate}
                                className="bg-red-600 hover:bg-red-700"
                              >
                                {submitting ? "Submitting..." : "Submit Recall"}
                              </Button>
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recall Requests Section */}
      <Card className="border-orange-200 bg-orange-50/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Send className="h-5 w-5 text-orange-600" />
            Recall Requests ({filteredRecalls.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filteredRecalls.length === 0 ? (
            <p className="text-slate-600">No recall requests yet</p>
          ) : (
            <div className="space-y-3">
              {filteredRecalls.map(recall => (
                <Card key={recall.id} className="border-l-4 border-l-orange-500">
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-semibold text-slate-900">Recall Request</h4>
                          <Badge className={`${getStatusColor(recall.status)}`}>
                            {getStatusLabel(recall.status)}
                          </Badge>
                        </div>
                        <p className="text-sm text-slate-600">
                          Requested by: {recall.requested_by_name || "Unknown"}
                        </p>
                        <p className="text-sm text-slate-700 mt-2">
                          <strong>Recall Date:</strong> {fmtDate(recall.recall_date)}
                        </p>
                        <p className="text-sm text-slate-700">
                          <strong>Reason:</strong> {recall.reason}
                        </p>
                        <p className="text-xs text-slate-500 mt-2">
                          Created: {fmtDate(recall.created_at)}
                        </p>
                      </div>
                      <div className="text-right">
                        {recall.status === "hr_approved" && (
                          <CheckCircle2 className="h-6 w-6 text-green-600" />
                        )}
                        {recall.status === "hr_rejected" && (
                          <XCircle className="h-6 w-6 text-red-600" />
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
