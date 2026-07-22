"use client"

import { useEffect, useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import { ShieldCheck, Calendar, FileText } from "lucide-react"

interface HRApprovalsClientProps {
  profile: { id: string; role: string }
}

export function HRApprovalsClient({ profile }: HRApprovalsClientProps) {
  const { toast } = useToast()
  const [requests, setRequests] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedRequest, setSelectedRequest] = useState<any>(null)
  const [actionLoading, setActionLoading] = useState(false)

  const loadRequests = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/leave/planning/hr-approve", { cache: "no-store" })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed to load requests")
      setRequests(json.requests || [])
    } catch (e) {
      console.error("[v0] Load requests error:", e)
      toast({
        title: "Error",
        description: "Failed to load leave requests",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    void loadRequests()
  }, [loadRequests])

  const handleApproveReject = async (requestId: string, action: "approve" | "reject") => {
    setActionLoading(true)
    try {
      const res = await fetch("/api/leave/planning/hr-approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leave_plan_request_id: requestId,
          action,
          comment: "",
        }),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed to process request")

      toast({
        title: action === "approve" ? "Approved" : "Rejected",
        description: `Leave request has been ${action === "approve" ? "approved" : "rejected"}.`,
      })

      setSelectedRequest(null)
      await loadRequests()
    } catch (e) {
      console.error("[v0] Action error:", e)
      toast({
        title: "Error",
        description: `Failed to ${action} request`,
        variant: "destructive",
      })
    } finally {
      setActionLoading(false)
    }
  }

  const fmtDate = (date: string) => {
    if (!date) return "—"
    const d = new Date(date)
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
  }

  const leaveTypeLabelShort = (key: string) => {
    const map: Record<string, string> = {
      annual: "Annual",
      sick: "Sick",
      compassionate: "Compassionate",
      study: "Study",
      maternity: "Maternity",
      paternity: "Paternity",
      special: "Special",
      bereavement: "Bereavement",
      unpaid: "Unpaid",
      other: "Other",
    }
    return map[key?.toLowerCase() || ""] || key || "—"
  }

  const getStatusColor = (status: string) => {
    const map: Record<string, string> = {
      hr_office_forwarded: "bg-amber-50 text-amber-800 border-amber-300",
      manager_confirmed: "bg-blue-50 text-blue-800 border-blue-300",
      hod_approved: "bg-emerald-50 text-emerald-800 border-emerald-300",
      approved: "bg-green-50 text-green-800 border-green-300",
      rejected: "bg-red-50 text-red-800 border-red-300",
    }
    return map[status] || "bg-slate-50 text-slate-800 border-slate-300"
  }

  const getStatusLabel = (status: string) => {
    const map: Record<string, string> = {
      hr_office_forwarded: "Awaiting HR Approval",
      manager_confirmed: "Manager Approved",
      hod_approved: "HOD Approved",
      approved: "Approved",
      rejected: "Rejected",
    }
    return map[status] || status
  }

  return (
    <main className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center gap-3 mb-2">
            <ShieldCheck className="w-8 h-8 text-green-600" />
            <h1 className="text-3xl font-bold text-slate-900">HR Leave Approvals</h1>
          </div>
          <p className="text-slate-600">Review and approve leave requests forwarded by the HR Leave Office</p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {loading ? (
          <div className="text-center py-16 text-slate-500">
            <span className="animate-spin inline-block">⏳</span> Loading requests...
          </div>
        ) : requests.length === 0 ? (
          <div className="bg-white rounded-lg border border-slate-200 p-12 text-center">
            <ShieldCheck className="w-12 h-12 mx-auto mb-4 text-slate-300" />
            <p className="font-medium text-slate-700">No Pending Approvals</p>
            <p className="text-sm text-slate-500 mt-1">All leave requests have been processed or are pending other approvals.</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-3 text-left font-semibold text-slate-700">Staff Name</th>
                    <th className="px-6 py-3 text-left font-semibold text-slate-700">Department</th>
                    <th className="px-6 py-3 text-left font-semibold text-slate-700">Leave Type</th>
                    <th className="px-6 py-3 text-left font-semibold text-slate-700">Period</th>
                    <th className="px-6 py-3 text-center font-semibold text-slate-700">Days</th>
                    <th className="px-6 py-3 text-left font-semibold text-slate-700">Status</th>
                    <th className="px-6 py-3 text-center font-semibold text-slate-700">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {requests.map((req: any) => {
                    const staffName = `${req.user?.first_name || ""} ${req.user?.last_name || ""}`.trim()
                    const deptName = req.user?.departments?.name || "—"
                    const leaveType = req.leave_type_key || "—"
                    const startDate = req.adjusted_start_date || req.preferred_start_date
                    const endDate = req.adjusted_end_date || req.preferred_end_date
                    const days = req.adjusted_days || req.requested_days || "—"
                    const statusColor = getStatusColor(req.status)
                    const statusLabel = getStatusLabel(req.status)

                    return (
                      <tr key={req.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4 font-medium text-slate-900">{staffName}</td>
                        <td className="px-6 py-4 text-slate-700">{deptName}</td>
                        <td className="px-6 py-4 text-slate-700">{leaveTypeLabelShort(leaveType)}</td>
                        <td className="px-6 py-4 text-slate-700 text-xs">
                          {fmtDate(startDate)} to {fmtDate(endDate)}
                        </td>
                        <td className="px-6 py-4 text-center font-semibold text-slate-900">{days}</td>
                        <td className="px-6 py-4">
                          <Badge className={`text-xs border ${statusColor}`}>{statusLabel}</Badge>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs"
                            onClick={() => setSelectedRequest(req)}
                          >
                            Review
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Detail Dialog */}
      {selectedRequest && (
        <Dialog open={!!selectedRequest} onOpenChange={() => setSelectedRequest(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Review Leave Request</DialogTitle>
              <DialogDescription>
                {selectedRequest.user?.first_name} {selectedRequest.user?.last_name} - {leaveTypeLabelShort(selectedRequest.leave_type_key)}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase">Start Date</p>
                  <p className="text-lg font-medium text-slate-900">{fmtDate(selectedRequest.adjusted_start_date || selectedRequest.preferred_start_date)}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase">End Date</p>
                  <p className="text-lg font-medium text-slate-900">{fmtDate(selectedRequest.adjusted_end_date || selectedRequest.preferred_end_date)}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase">Days Requested</p>
                  <p className="text-lg font-medium text-slate-900">{selectedRequest.adjusted_days || selectedRequest.requested_days} days</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase">Department</p>
                  <p className="text-lg font-medium text-slate-900">{selectedRequest.user?.departments?.name || "—"}</p>
                </div>
              </div>

              {selectedRequest.reason && (
                <div className="bg-slate-50 rounded-lg p-4">
                  <p className="text-xs font-semibold text-slate-500 uppercase mb-2 flex items-center gap-2">
                    <FileText className="w-4 h-4" /> Reason
                  </p>
                  <p className="text-slate-700">{selectedRequest.reason}</p>
                </div>
              )}

              <div className="flex gap-3 justify-end pt-4 border-t border-slate-200">
                <Button variant="outline" onClick={() => setSelectedRequest(null)} disabled={actionLoading}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => handleApproveReject(selectedRequest.id, "reject")}
                  disabled={actionLoading}
                >
                  {actionLoading ? "Processing..." : "Reject"}
                </Button>
                <Button
                  onClick={() => handleApproveReject(selectedRequest.id, "approve")}
                  disabled={actionLoading}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {actionLoading ? "Processing..." : "Approve"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </main>
  )
}
