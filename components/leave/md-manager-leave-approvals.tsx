"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import { CalendarDays, CheckCircle2, Clock3, Loader2, UserRound } from "lucide-react"

export interface ManagerLeaveApprovalRequest {
  id: string
  status: string
  workflow_stage: string | null
  leave_type_key: string
  staff_category: string | null
  preferred_start_date: string
  preferred_end_date: string
  adjusted_start_date: string | null
  adjusted_end_date: string | null
  hr_approved_start_date: string | null
  hr_approved_end_date: string | null
  requested_days: number | null
  adjusted_days: number | null
  hr_approved_at: string | null
  hr_approver_name: string | null
  memo_reference: string | null
  user: {
    first_name: string | null
    last_name: string | null
    employee_id: string | null
    position: string | null
    department_name: string | null
  } | null
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—"
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })
}

function leaveTypeLabel(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export function MdManagerLeaveApprovals({ requests: initialRequests }: { requests: ManagerLeaveApprovalRequest[] }) {
  const [requests, setRequests] = useState(initialRequests)
  const [selectedRequest, setSelectedRequest] = useState<ManagerLeaveApprovalRequest | null>(null)
  const [approving, setApproving] = useState(false)
  const { toast } = useToast()

  const approveSelected = async () => {
    if (!selectedRequest || approving) return
    setApproving(true)
    try {
      const response = await fetch("/api/leave/planning/md-approval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leave_plan_request_id: selectedRequest.id }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || "Could not approve this leave request.")
      setRequests((current) => current.filter((request) => request.id !== selectedRequest.id))
      toast({ title: "Manager leave approved", description: "Final MD approval is recorded. Memo access follows the 14-day annual leave window." })
      setSelectedRequest(null)
    } catch (error) {
      toast({ title: "Approval failed", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" })
    } finally {
      setApproving(false)
    }
  }

  return (
    <>
      <Card className="overflow-hidden border-amber-200 shadow-sm">
        <CardHeader className="border-b border-amber-100 bg-amber-50/70">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base text-slate-900">
                <CheckCircle2 className="h-5 w-5 text-amber-700" /> Manager Leave — Final MD Approval
              </CardTitle>
              <CardDescription className="mt-1">HR-approved manager-category leave requests awaiting your final decision.</CardDescription>
            </div>
            <Badge variant="secondary" className="bg-amber-100 text-amber-900">{requests.length} awaiting</Badge>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 p-4">
          <p className="flex items-start gap-2 rounded-lg border border-sky-100 bg-sky-50 px-3 py-2 text-xs leading-relaxed text-sky-900">
            <Clock3 className="mt-0.5 h-4 w-4 shrink-0" /> After final approval, annual leave memos become downloadable during the 14 days before the approved start date.
          </p>
          {requests.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">No manager leave requests are waiting for MD approval.</div>
          ) : requests.map((request) => {
            const staffName = `${request.user?.first_name || ""} ${request.user?.last_name || ""}`.trim() || "Staff member"
            const start = request.hr_approved_start_date || request.adjusted_start_date || request.preferred_start_date
            const end = request.hr_approved_end_date || request.adjusted_end_date || request.preferred_end_date
            const days = request.adjusted_days || request.requested_days || 0
            return (
              <div key={request.id} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-amber-300 hover:bg-amber-50/20">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-sm font-bold text-amber-900">
                    {staffName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "ST"}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-900">{staffName}</span>
                      {request.user?.employee_id && <span className="font-mono text-xs text-slate-500">#{request.user.employee_id}</span>}
                      <Badge variant="outline" className="border-amber-300 text-amber-800">Manager</Badge>
                    </div>
                    <p className="mt-1 text-xs text-slate-600">
                      {leaveTypeLabel(request.leave_type_key)} · {formatDate(start)} – {formatDate(end)} · {days} day{days === 1 ? "" : "s"}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {[request.user?.position, request.user?.department_name, request.hr_approver_name ? `HR: ${request.hr_approver_name}` : null].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                </div>
                <Button onClick={() => setSelectedRequest(request)} className="bg-amber-700 text-white hover:bg-amber-800">
                  <CheckCircle2 data-icon="inline-start" /> Review &amp; Approve
                </Button>
              </div>
            )
          })}
        </CardContent>
      </Card>

      <Dialog open={Boolean(selectedRequest)} onOpenChange={(open) => !open && !approving && setSelectedRequest(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Final MD approval</DialogTitle>
            <DialogDescription>
              Confirm final approval for {selectedRequest?.user?.first_name} {selectedRequest?.user?.last_name}&apos;s manager-category leave request.
            </DialogDescription>
          </DialogHeader>
          {selectedRequest && (
            <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
              <p className="font-semibold text-slate-900">{leaveTypeLabel(selectedRequest.leave_type_key)} · {selectedRequest.user?.employee_id || "Staff member"}</p>
              <p className="flex items-center gap-2 text-slate-600"><CalendarDays className="h-4 w-4" /> {formatDate(selectedRequest.hr_approved_start_date || selectedRequest.adjusted_start_date || selectedRequest.preferred_start_date)} – {formatDate(selectedRequest.hr_approved_end_date || selectedRequest.adjusted_end_date || selectedRequest.preferred_end_date)}</p>
              <p className="flex items-center gap-2 text-slate-600"><UserRound className="h-4 w-4" /> HR-approved by {selectedRequest.hr_approver_name || "HR Executive"}</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedRequest(null)} disabled={approving}>Cancel</Button>
            <Button onClick={() => void approveSelected()} disabled={approving} className="bg-amber-700 text-white hover:bg-amber-800">
              {approving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 data-icon="inline-start" />}
              {approving ? "Approving..." : "Confirm MD Approval"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
