/**
 * Leave Request Detail Panel with Memo & Payment Features
 * Shows full details of a leave request including:
 * - Memo draft and approval status
 * - Payment memo status and details
 * - Download options for approved memos
 */

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Download,
  FileText,
  DollarSign,
  CheckCircle2,
  Clock,
  AlertCircle,
  Pencil,
  Send,
  Eye,
} from "lucide-react"

interface LeaveRequest {
  id: string
  user_id?: string
  preferred_start_date: string
  preferred_end_date: string
  adjusted_start_date?: string
  adjusted_end_date?: string
  requested_days?: number
  adjusted_days?: number
  leave_type_key?: string
  status: string
  submitted_at: string
  hr_approved_at?: string
  memo_token?: string
  memo_draft_subject?: string
  memo_draft_body?: string
  memo_generated_at?: string
  payment_due_amount?: number
  payment_currency?: string
  payment_memo_generated?: boolean
  payment_memo_forwarded_to_accounts?: boolean
  accounts_acknowledgment_at?: string
  hr_office_reviewer_name?: string
  adjustment_reason?: string
}

interface LeaveRequestDetailPanelProps {
  request: LeaveRequest
  onDownloadMemo?: (requestId: string, token: string) => void
  onViewPaymentMemo?: (requestId: string) => void
  onEditPayment?: (requestId: string) => void
  isApproved?: boolean
  isStaff?: boolean
}

function fmtDate(val?: string | null) {
  if (!val) return "—"
  try {
    return new Date(val).toLocaleDateString("en-GH", { day: "2-digit", month: "short", year: "numeric" })
  } catch {
    return val
  }
}

function getStatusBadgeColor(status: string) {
  const map: Record<string, string> = {
    "pending_hod_review": "bg-blue-100 text-blue-800",
    "hod_approved": "bg-purple-100 text-purple-800",
    "hr_office_forwarded": "bg-cyan-100 text-cyan-800",
    "hr_approved": "bg-emerald-100 text-emerald-800",
    "hr_rejected": "bg-red-100 text-red-800",
  }
  return map[status] || "bg-slate-100 text-slate-800"
}

export function LeaveRequestDetailPanel({
  request,
  onDownloadMemo,
  onViewPaymentMemo,
  onEditPayment,
  isApproved = false,
  isStaff = false,
}: LeaveRequestDetailPanelProps) {
  const effectiveStart = request.adjusted_start_date || request.preferred_start_date
  const effectiveEnd = request.adjusted_end_date || request.preferred_end_date
  const effectiveDays = request.adjusted_days || request.requested_days || 0

  return (
    <div className="space-y-4">
      {/* Main leave details */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Leave Details</CardTitle>
            <Badge className={getStatusBadgeColor(request.status)}>
              {request.status.replace(/_/g, " ")}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="font-medium">Leave Period:</span>
              <p className="text-slate-600">{fmtDate(effectiveStart)} to {fmtDate(effectiveEnd)}</p>
            </div>
            <div>
              <span className="font-medium">Days Approved:</span>
              <p className="text-slate-600">{effectiveDays} day(s)</p>
            </div>
          </div>

          {request.adjusted_days && request.requested_days !== request.adjusted_days && (
            <Alert className="bg-amber-50 border-amber-200">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-xs text-amber-700 ml-2">
                <strong>HR Adjustment:</strong> Days adjusted from {request.requested_days} to {request.adjusted_days}
                {request.adjustment_reason && ` — Reason: ${request.adjustment_reason}`}
              </AlertDescription>
            </Alert>
          )}

          {request.hr_office_reviewer_name && (
            <div className="text-xs text-slate-500 bg-slate-50 p-2 rounded">
              Reviewed by: <strong>{request.hr_office_reviewer_name}</strong> (HR Leave Office)
            </div>
          )}
        </CardContent>
      </Card>

      {/* Memo Status & Download */}
      {isApproved && (
        <Card className="border-emerald-200 bg-emerald-50/50">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-emerald-600" />
              <CardTitle className="text-base text-emerald-900">Leave Approval Memo</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              <span className="text-sm font-medium text-emerald-700">Approved & Ready for Download</span>
            </div>

            {request.memo_draft_subject && (
              <div className="text-xs bg-white p-2 rounded border border-emerald-200 space-y-1">
                <p className="font-medium text-slate-700">Memo Subject:</p>
                <p className="text-slate-600">{request.memo_draft_subject}</p>
              </div>
            )}

            {request.memo_draft_body && (
              <div className="text-xs bg-white p-2 rounded border border-emerald-200">
                <p className="font-medium text-slate-700 mb-1">Memo Preview:</p>
                <p className="text-slate-600 whitespace-pre-wrap max-h-[150px] overflow-y-auto text-xs">
                  {request.memo_draft_body.substring(0, 300)}...
                </p>
              </div>
            )}

            {request.memo_token && onDownloadMemo && (
              <Button
                size="sm"
                className="w-full bg-emerald-600 hover:bg-emerald-700"
                onClick={() => onDownloadMemo(request.id, request.memo_token!)}
              >
                <Download className="h-4 w-4 mr-2" />
                Download Leave Approval Memo (PDF)
              </Button>
            )}

            {request.memo_generated_at && (
              <p className="text-xs text-slate-500">
                Generated: {fmtDate(request.memo_generated_at)}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Payment Memo Status */}
      {request.payment_due_amount && (
        <Card className="border-blue-200 bg-blue-50/50">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-blue-600" />
                <CardTitle className="text-base text-blue-900">Leave Payment Memo</CardTitle>
              </div>
              <Badge className="bg-blue-100 text-blue-800">
                {request.payment_memo_forwarded_to_accounts ? "Sent to Accounts" : "Pending"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="font-medium">Payment Amount:</span>
                <p className="text-blue-700 font-bold">
                  {request.payment_currency || "GHS"} {request.payment_due_amount?.toLocaleString("en-GH", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </p>
              </div>
              <div>
                <span className="font-medium">Status:</span>
                <p className="text-slate-600">
                  {request.accounts_acknowledgment_at ? (
                    <span className="text-emerald-600 flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Acknowledged by Accounts
                    </span>
                  ) : request.payment_memo_forwarded_to_accounts ? (
                    <span className="text-blue-600 flex items-center gap-1">
                      <Clock className="h-3 w-3" /> Awaiting Accounts
                    </span>
                  ) : (
                    <span className="text-amber-600">Draft/In Progress</span>
                  )}
                </p>
              </div>
            </div>

            {request.payment_memo_forwarded_to_accounts && !request.accounts_acknowledgment_at && (
              <Alert className="bg-blue-50 border-blue-200">
                <Clock className="h-4 w-4 text-blue-600" />
                <AlertDescription className="text-xs text-blue-700 ml-2">
                  Payment memo has been forwarded to Accounts department for processing. Awaiting acknowledgment.
                </AlertDescription>
              </Alert>
            )}

            {request.accounts_acknowledgment_at && (
              <Alert className="bg-emerald-50 border-emerald-200">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <AlertDescription className="text-xs text-emerald-700 ml-2">
                  Payment confirmed by Accounts on {fmtDate(request.accounts_acknowledgment_at)}
                </AlertDescription>
              </Alert>
            )}

            <div className="flex gap-2 pt-2">
              {onViewPaymentMemo && (
                <Button size="sm" variant="outline" className="flex-1" onClick={() => onViewPaymentMemo(request.id)}>
                  <Eye className="h-4 w-4 mr-1" />
                  View Memo
                </Button>
              )}
              {!request.payment_memo_forwarded_to_accounts && onEditPayment && (
                <Button size="sm" variant="outline" className="flex-1" onClick={() => onEditPayment(request.id)}>
                  <Pencil className="h-4 w-4 mr-1" />
                  Edit Payment
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* For HR staff: Memo draft editing section */}
      {!isStaff && request.status === "hr_office_forwarded" && (
        <Card className="border-purple-200 bg-purple-50/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-purple-900">Memo Draft Ready for HR Review</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="text-purple-700">
              The HR Leave Office has prepared the leave approval memo. You can review and edit before final approval.
            </p>
            <Button size="sm" className="bg-purple-600 hover:bg-purple-700 w-full">
              <Pencil className="h-4 w-4 mr-1" />
              Review & Edit Memo
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Timeline */}
      <Card className="bg-slate-50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Timeline</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs">
          <div className="flex items-start gap-2">
            <div className="h-2 w-2 rounded-full bg-slate-400 mt-1.5 flex-shrink-0" />
            <div>
              <p className="font-medium">Submitted</p>
              <p className="text-slate-600">{fmtDate(request.submitted_at)}</p>
            </div>
          </div>
          {request.hr_approved_at && (
            <div className="flex items-start gap-2">
              <div className="h-2 w-2 rounded-full bg-emerald-500 mt-1.5 flex-shrink-0" />
              <div>
                <p className="font-medium">HR Approved</p>
                <p className="text-slate-600">{fmtDate(request.hr_approved_at)}</p>
              </div>
            </div>
          )}
          {request.payment_memo_forwarded_to_accounts && (
            <div className="flex items-start gap-2">
              <div className="h-2 w-2 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />
              <div>
                <p className="font-medium">Payment Memo Sent to Accounts</p>
                <p className="text-slate-600">{fmtDate(request.payment_memo_forwarded_at)}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
