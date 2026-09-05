'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CheckCircle, XCircle, Clock, FileText, Download, AlertCircle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { useToast } from '@/hooks/use-toast'

interface FDReview {
  id: string
  loan_request_id: string
  staff_user_id: string
  staff_name?: string
  staff_number?: string
  loan_type?: string
  request_number?: string
  requested_amount?: number
  monthly_deduction?: number
  repayment_months?: number
  fd_value: number
  fd_score?: number
  fd_good?: boolean
  fd_document_url?: string
  supporting_docs_url?: string
  submission_date: string
  submission_memo: string
  fd_note?: string
  status?: string
  review_status: 'pending_review' | 'approved' | 'rejected'
}

const GOOD_FD_THRESHOLD = 39

function coerceFdScoreLocal(score: number | string | null | undefined): number | null {
  if (typeof score === 'number' && Number.isFinite(score)) return score
  if (score == null || score === '') return null
  const n = Number(score)
  return Number.isFinite(n) ? n : null
}

function isPoorFdScoreLocal(score: number | string | null | undefined, fdGood?: boolean | null): boolean {
  const n = coerceFdScoreLocal(score)
  if (n != null) return n < GOOD_FD_THRESHOLD
  return fdGood === false
}

function formatFdPercentLocal(score: number | string | null | undefined): string {
  const n = coerceFdScoreLocal(score)
  if (n == null) return 'N/A'
  return `${Math.round(n)}%`
}

function isFdExemptLoanTypeLocal(loanTypeKey: string | null | undefined, loanTypeLabel?: string | null): boolean {
  const key = String(loanTypeKey || '').toLowerCase()
  const label = String(loanTypeLabel || '').toLowerCase()
  const exemptPattern = /funeral|repair|insurance/
  return exemptPattern.test(key) || exemptPattern.test(label)
}

function parseLoanOfficeMemo(memo?: string) {
  if (!memo) return [] as Array<{ key: string; value: string }>
  const pairs = Array.from(memo.matchAll(/\[([^:\]]+):([^\]]+)\]/g)).map((match) => ({
    key: String(match[1] || '').trim().replace(/_/g, ' '),
    value: String(match[2] || '').trim(),
  }))
  return pairs
}

function openFdSheetPrintView(review: FDReview) {
  const win = window.open('', '_blank', 'width=900,height=1000')
  if (!win) return

  const rows = parseLoanOfficeMemo(review.submission_memo)
    .map((r) => `<tr><td>${r.key}</td><td>${r.value}</td></tr>`)
    .join('')

  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>FD Calculation Sheet - ${review.request_number || review.id}</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 24px; color: #111827; }
      h1 { font-size: 18px; margin-bottom: 6px; }
      .meta { font-size: 12px; margin-bottom: 16px; color: #334155; }
      table { width: 100%; border-collapse: collapse; margin-top: 12px; }
      th, td { border: 1px solid #cbd5e1; padding: 8px; font-size: 12px; text-align: left; }
      th { background: #f1f5f9; }
      .section { margin-top: 16px; }
      pre { background: #f8fafc; border: 1px solid #e2e8f0; padding: 12px; white-space: pre-wrap; font-size: 12px; }
    </style>
  </head>
  <body>
    <h1>Financial Standing (FD) Sheet</h1>
    <div class="meta">Staff: ${review.staff_name || 'N/A'} | Staff No: ${review.staff_number || 'N/A'} | Ref: ${review.request_number || review.id}</div>
    <table>
      <thead>
        <tr>
          <th>Field</th>
          <th>Value</th>
        </tr>
      </thead>
      <tbody>
        <tr><td>Loan Type</td><td>${review.loan_type || 'N/A'}</td></tr>
        <tr><td>Requested Amount</td><td>GHS ${Number(review.requested_amount || 0).toLocaleString()}</td></tr>
        <tr><td>FD Score</td><td>${formatFdPercentLocal(review.fd_score)}</td></tr>
        <tr><td>Review Status</td><td>${review.review_status}</td></tr>
        ${rows || '<tr><td colspan="2">No structured routing fields found</td></tr>'}
      </tbody>
    </table>
    <div class="section">
      <strong>Loan Office Notes</strong>
      <pre>${review.submission_memo || 'N/A'}</pre>
    </div>
    <div class="section">
      <strong>FD Calculation Details</strong>
      <pre>${review.fd_note || 'N/A'}</pre>
    </div>
    <script>window.print()</script>
  </body>
</html>`

  win.document.open()
  win.document.write(html)
  win.document.close()
}

// Helper to parse and display FD calculation details
function FDCalculationDetails({ fdNote }: { fdNote?: string }) {
  if (!fdNote) return null
  
  try {
    // Try to parse as JSON first (structured data)
    const data = JSON.parse(fdNote)
    return (
      <div className="space-y-3 p-4 bg-emerald-50 border border-emerald-200 rounded">
        <div className="text-sm font-semibold text-emerald-900">FD Calculation Breakdown</div>
        
        <div className="grid grid-cols-2 gap-3 text-sm">
          {data.salary_per_annum && (
            <>
              <div><span className="text-emerald-700">Annual Salary:</span></div>
              <div className="font-medium">₵ {Number(data.salary_per_annum).toLocaleString()}</div>
            </>
          )}
          {data.consolidated_salary_per_month && (
            <>
              <div><span className="text-emerald-700">Monthly Salary:</span></div>
              <div className="font-medium">₵ {Number(data.consolidated_salary_per_month).toLocaleString()}</div>
            </>
          )}
          {data.other_allowances && (
            <>
              <div><span className="text-emerald-700">Allowances:</span></div>
              <div className="font-medium">₵ {Number(data.other_allowances).toLocaleString()}</div>
            </>
          )}
          {data.gross_salary_monthly && (
            <>
              <div><span className="text-emerald-700">Gross Monthly:</span></div>
              <div className="font-medium">₵ {Number(data.gross_salary_monthly).toLocaleString()}</div>
            </>
          )}
          {data.gross_deductions_monthly && (
            <>
              <div><span className="text-red-700">Gross Deductions:</span></div>
              <div className="font-medium text-red-600">₵ {Number(data.gross_deductions_monthly).toLocaleString()}</div>
            </>
          )}
          {data.loan_installment_monthly && (
            <>
              <div><span className="text-red-700">Loan Installment:</span></div>
              <div className="font-medium text-red-600">₵ {Number(data.loan_installment_monthly).toLocaleString()}</div>
            </>
          )}
          {data.total_deductions_monthly && (
            <>
              <div><span className="text-red-700 font-semibold">Total Deduction:</span></div>
              <div className="font-semibold text-red-600">₵ {Number(data.total_deductions_monthly).toLocaleString()}</div>
            </>
          )}
          {data.net_salary_monthly && (
            <>
              <div><span className="text-emerald-700 font-semibold">Net Monthly Salary:</span></div>
              <div className="font-semibold text-emerald-700">₵ {Number(data.net_salary_monthly).toLocaleString()}</div>
            </>
          )}
          {data.net_to_gross_ratio && (
            <>
              <div><span className="text-emerald-700">Net/Gross Ratio:</span></div>
              <div className="font-medium">{Number(data.net_to_gross_ratio).toFixed(2)}%</div>
            </>
          )}
          {data.total_outstanding_loans && (
            <>
              <div><span className="text-amber-700 font-semibold">Outstanding Loans:</span></div>
              <div className="font-semibold text-amber-700">₵ {Number(data.total_outstanding_loans).toLocaleString()}</div>
            </>
          )}
        </div>

        {data.outstanding_loans && Object.keys(data.outstanding_loans).length > 0 && (
          <div className="border-t border-emerald-200 pt-3 mt-3">
            <div className="text-xs font-semibold text-emerald-900 mb-2">Outstanding Loans Detail:</div>
            <div className="space-y-1 text-xs">
              {Object.entries(data.outstanding_loans).map(([key, value]) => (
                <div key={key} className="flex justify-between">
                  <span className="text-emerald-700">{String(key).replace(/_/g, ' ')}:</span>
                  <span className="font-medium">₵ {Number(value as number).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  } catch (e) {
    // If not JSON, display as plain text
    return (
      <div className="p-3 bg-blue-50 border border-blue-200 rounded text-sm">
        <p className="text-xs font-semibold text-blue-900 mb-1">FD Calculation Details:</p>
        <p className="text-blue-800 whitespace-pre-wrap">{fdNote}</p>
      </div>
    )
  }
}

export function AccountsExecutiveFDDashboard({
  userId,
  userRole,
  onPendingCountChange,
}: {
  userId: string
  userRole: string
  onPendingCountChange?: (count: number) => void
}) {
  const [reviews, setReviews] = useState<FDReview[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedReview, setSelectedReview] = useState<FDReview | null>(null)
  const [verificationMemo, setVerificationMemo] = useState('')
  const [reviewDecision, setReviewDecision] = useState('')
  const [adjustedFdScore, setAdjustedFdScore] = useState('')
  const [adjustmentReason, setAdjustmentReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    fetchPendingReviews()
  }, [])

  const fetchPendingReviews = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/loan/fd-review?status=pending_review')
      const data = await res.json()

      if (data.success) {
        const queue = data.reviews || []
        setReviews(queue)
        onPendingCountChange?.(queue.length)
      } else {
        onPendingCountChange?.(0)
        toast({ title: 'Error', description: data.error, variant: 'destructive' })
      }
    } catch (error) {
      onPendingCountChange?.(0)
      console.error('[v0] Error fetching FD reviews:', error)
      toast({ title: 'Error', description: 'Failed to load FD reviews', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  const isPoorFD = (review: FDReview): boolean => {
    // Numeric score is authoritative; scores >= GOOD_FD_THRESHOLD are never "poor"
    return isPoorFdScoreLocal(review.fd_score, review.fd_good)
  }

  /** Client-safe reject rule: no reject for exempt types, reject only when score is truly poor. */
  const canRejectByScoreRule = (review: FDReview): boolean => {
    if (isFdExemptLoanTypeLocal(review.loan_type, review.loan_type)) return false
    return isPoorFdScoreLocal(review.fd_score, review.fd_good)
  }

  /** Auto-reject only when score is truly poor AND loan type is not FD-exempt (funeral/insurance/repair) */
  const canAutoReject = (review: FDReview): boolean => {
    return canRejectByScoreRule(review)
  }

  const handleAutoRejectPoorFD = async (review: FDReview) => {
    try {
      if (!canAutoReject(review)) {
        toast({
          title: 'Not eligible for auto-reject',
          description: isFdExemptLoanTypeLocal(review.loan_type, review.loan_type)
            ? `${review.loan_type} loans stay reviewable at any FD score.`
            : `FD score ${review.fd_score} is at or above the ${GOOD_FD_THRESHOLD}% threshold and cannot be rejected.`,
        })
        return
      }
      setSubmitting(true)
      const res = await fetch('/api/loan/fd-review', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          review_id: review.id,
          review_status: 'rejected',
          fd_verification_memo: `Auto-rejected: FD score below acceptable threshold (< ${GOOD_FD_THRESHOLD})`,
          review_decision: `Automatic rejection due to poor FD score of ${review.fd_score || 'N/A'}. Loan Office must resubmit with corrected calculations.`,
        }),
      })

      const data = await res.json()

      if (data.success) {
        toast({ 
          title: 'Auto-Rejected', 
          description: `Poor FD (Score: ${review.fd_score}) automatically rejected and returned to Loan Office`,
          variant: 'destructive'
        })
        fetchPendingReviews()
      } else {
        toast({ title: 'Error', description: data.error, variant: 'destructive' })
      }
    } catch (error) {
      console.error('[v0] Error auto-rejecting poor FD:', error)
      toast({ title: 'Error', description: 'Failed to auto-reject FD request', variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  const handleApprove = async () => {
    if (!selectedReview) return

    const score = adjustedFdScore.trim() === '' ? Number(selectedReview.fd_score) : Number(adjustedFdScore)
    if (!Number.isFinite(score) || score < 0 || score > 100) {
      toast({ title: 'Invalid FD score', description: 'Enter a whole percentage between 0 and 100.', variant: 'destructive' })
      return
    }
    if (Math.round(score) !== Math.round(Number(selectedReview.fd_score)) && !adjustmentReason.trim()) {
      toast({ title: 'Adjustment reason required', description: 'Document why the generated FD score was adjusted.', variant: 'destructive' })
      return
    }

    try {
      setSubmitting(true)
      const res = await fetch('/api/loan/fd-review', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          review_id: selectedReview.id,
          review_status: 'approved',
          fd_verification_memo: verificationMemo,
          review_decision: reviewDecision,
          adjusted_fd_score: Math.round(score),
          adjustment_reason: adjustmentReason.trim(),
        }),
      })

      const data = await res.json()

      if (data.success) {
        toast({ title: 'Success', description: 'FD request approved and sent to HR Leave Office' })
        setSelectedReview(null)
        setVerificationMemo('')
        setReviewDecision('')
        setAdjustedFdScore('')
        setAdjustmentReason('')
        fetchPendingReviews()
      } else {
        const errorMsg = data.details || data.error || 'Unknown error'
        console.error('[v0] FD approval error:', errorMsg)
        toast({ title: 'Error', description: errorMsg, variant: 'destructive' })
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to approve FD request'
      console.error('[v0] Error approving FD:', errorMsg)
      toast({ title: 'Error', description: errorMsg, variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  const handleReject = async () => {
    if (!selectedReview) return

    try {
      setSubmitting(true)
      const res = await fetch('/api/loan/fd-review', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          review_id: selectedReview.id,
          review_status: 'rejected',
          fd_verification_memo: verificationMemo,
          review_decision: reviewDecision,
        }),
      })

      const data = await res.json()

      if (data.success) {
        toast({ title: 'Success', description: 'FD request rejected and returned to Loan Office' })
        setSelectedReview(null)
        setVerificationMemo('')
        setReviewDecision('')
        fetchPendingReviews()
      } else {
        toast({ title: 'Error', description: data.error, variant: 'destructive' })
      }
    } catch (error) {
      console.error('[v0] Error rejecting FD:', error)
      toast({ title: 'Error', description: 'Failed to reject FD request', variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center">Loading FD reviews...</CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-amber-500" />
            FD Verification Queue
          </CardTitle>
          <CardDescription>
            Review FD requests submitted by Loan Office. Verify calculations and supporting documents.
          </CardDescription>
        </CardHeader>
      </Card>

      {reviews.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-slate-500">
            <CheckCircle className="h-12 w-12 mx-auto mb-3 text-emerald-500" />
            <p>No pending FD reviews</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {reviews.map(review => {
            const scoreNum = Number(review.fd_score)
            const poorFD = isPoorFD(review)
            const showAutoReject = canAutoReject(review)
            const exempt = isFdExemptLoanTypeLocal(review.loan_type, review.loan_type)
            const borderColor = showAutoReject ? 'border-l-red-400' : 'border-l-amber-400'
            const badgeClass = showAutoReject ? 'bg-red-50 text-red-700 border-red-300' : 'bg-amber-50 text-amber-700 border-amber-300'
            
            return (
            <Card key={review.id} className={`border-l-4 ${borderColor}`}>
              <CardContent className="pt-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-4">
                  <div>
                    <p className="font-semibold text-sm">
                      {review.staff_name || 'Unknown Staff'}
                      {review.staff_number && <span className="text-slate-400 font-normal ml-1">#{review.staff_number}</span>}
                    </p>
                    <p className="text-xs text-slate-500">
                      {review.loan_type || 'Loan'} &bull; Ref: {review.request_number || review.id.slice(0, 8)}
                    </p>
                    {review.requested_amount && (
                      <p className="text-xs text-slate-500">
                        Amount: ₵{Number(review.requested_amount).toLocaleString()} &bull; {review.repayment_months}mo
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 sm:justify-end">
                    {showAutoReject && (
                      <Badge variant="destructive" className="bg-red-50 text-red-700 border border-red-300">
                        <AlertCircle className="h-3 w-3 mr-1" />
                        Poor FD
                      </Badge>
                    )}
                    {exempt && (
                      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300">
                        FD-exempt type
                      </Badge>
                    )}
                    {!poorFD && Number.isFinite(scoreNum) && (
                      <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300">
                        Acceptable FD (≥{GOOD_FD_THRESHOLD})
                      </Badge>
                    )}
                    <Badge variant="outline" className={badgeClass}>
                      <Clock className="h-3 w-3 mr-1" />
                      {showAutoReject ? 'Action Required' : 'Pending Review'}
                    </Badge>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4 mb-4 p-3 bg-slate-50 rounded">
                  <div>
                    <p className="text-xs text-slate-500">FD Score (%)</p>
                    <p className={`font-bold text-lg ${poorFD ? 'text-red-600' : 'text-green-600'}`}>
                      {formatFdPercentLocal(review.fd_score)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Submitted</p>
                    <p className="text-sm">{new Date(review.submission_date).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Supporting Docs</p>
                    {review.supporting_docs_url ? (
                      <Button size="sm" variant="ghost" className="text-xs h-6">
                        <Download className="h-3 w-3 mr-1" />
                        View
                      </Button>
                    ) : (
                      <p className="text-xs text-slate-400">None</p>
                    )}
                  </div>
                </div>

                {review.submission_memo && (
                  <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded text-sm">
                    <p className="text-xs font-semibold text-blue-900 mb-1">Loan Office Notes:</p>
                    {parseLoanOfficeMemo(review.submission_memo).length > 0 ? (
                      <div className="space-y-1">
                        {parseLoanOfficeMemo(review.submission_memo).map((item, idx) => (
                          <p key={`${review.id}-memo-${idx}`} className="text-blue-800">
                            <span className="font-semibold uppercase text-xs mr-1">{item.key}:</span>
                            {item.value}
                          </p>
                        ))}
                      </div>
                    ) : (
                      <p className="text-blue-800 whitespace-pre-wrap">{review.submission_memo}</p>
                    )}
                  </div>
                )}

                {/* Scores >= threshold always get Review; only truly poor non-exempt get Auto-Reject + optional Review */}
                <div className="space-y-2">
                  {showAutoReject && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded text-sm">
                      <p className="text-xs font-semibold text-red-900 mb-1">
                        <AlertCircle className="h-3 w-3 inline mr-1" />
                        Poor FD Detected
                      </p>
                      <p className="text-red-800">
                        FD score {review.fd_score} is below the acceptable threshold ({GOOD_FD_THRESHOLD}). You may auto-reject or still open a manual review.
                      </p>
                    </div>
                  )}
                  {showAutoReject && (
                    <Button
                      onClick={() => handleAutoRejectPoorFD(review)}
                      disabled={submitting}
                      className="w-full bg-red-600 hover:bg-red-700"
                    >
                      <XCircle className="h-4 w-4 mr-1" />
                      Auto-Reject Poor FD
                    </Button>
                  )}
                  <Button
                    onClick={() => {
                      setSelectedReview(review)
                      setAdjustedFdScore(String(Math.round(Number(review.fd_score) || 0)))
                      setAdjustmentReason('')
                    }}
                    className="w-full"
                    variant={showAutoReject ? 'outline' : 'default'}
                  >
                    Review &amp; Approve
                  </Button>
                </div>
              </CardContent>
            </Card>
            )
          })}
        </div>
      )}

      {/* Review Dialog - Modern Compact Layout */}
      <Dialog open={!!selectedReview} onOpenChange={open => !open && setSelectedReview(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="pb-3 border-b">
            <div className="flex items-start justify-between gap-4">
              <div>
                <DialogTitle className="text-lg">FD Verification Review</DialogTitle>
                <DialogDescription className="text-xs mt-1">Review calculation and approve or reject</DialogDescription>
              </div>
              {selectedReview && (
                <div className={`px-3 py-1 rounded text-sm font-semibold whitespace-nowrap ${!isPoorFdScoreLocal(selectedReview.fd_score, selectedReview.fd_good) ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                  Score: {selectedReview.fd_score ?? 'N/A'}/100
                </div>
              )}
            </div>
          </DialogHeader>

          {selectedReview && (
            <div className="space-y-3">
              {/* Quick Info Row */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="bg-slate-50 p-3 rounded">
                  <p className="text-xs font-semibold text-slate-600">Staff</p>
                  <p className="text-sm font-medium truncate">{selectedReview.staff_name || 'N/A'}</p>
                </div>
                <div className="bg-slate-50 p-3 rounded">
                  <p className="text-xs font-semibold text-slate-600">Loan Type</p>
                  <p className="text-sm font-medium truncate">{selectedReview.loan_type || 'N/A'}</p>
                </div>
                <div className="bg-slate-50 p-3 rounded">
                  <p className="text-xs font-semibold text-slate-600">Amount</p>
                  <p className="text-sm font-medium">₵{Number(selectedReview.requested_amount || 0).toLocaleString()}</p>
                </div>
                <div className="bg-slate-50 p-3 rounded">
                  <p className="text-xs font-semibold text-slate-600">Ref</p>
                  <p className="text-sm font-mono truncate">{selectedReview.request_number || selectedReview.id.slice(0, 8)}</p>
                </div>
              </div>

              {/* Collapsible Calculation Details */}
              {selectedReview.fd_note && (
                <details className="group border rounded-lg cursor-pointer">
                  <summary className="px-4 py-3 bg-emerald-50 hover:bg-emerald-100 font-semibold text-sm flex items-center justify-between select-none">
                    <span>FD Calculation Details</span>
                    <span className="text-xs group-open:rotate-180 transition-transform">▼</span>
                  </summary>
                  <div className="p-4 bg-white border-t">
                    <FDCalculationDetails fdNote={selectedReview.fd_note} />
                  </div>
                </details>
              )}

              {/* Notes Section */}
              {(selectedReview.submission_memo || selectedReview.fd_note) && (
                <details className="group border rounded-lg cursor-pointer">
                  <summary className="px-4 py-3 bg-blue-50 hover:bg-blue-100 font-semibold text-sm flex items-center justify-between select-none">
                    <span>Supporting Documents</span>
                    <span className="text-xs group-open:rotate-180 transition-transform">▼</span>
                  </summary>
                  <div className="p-4 bg-white border-t space-y-3 text-sm">
                    {selectedReview.submission_memo && (
                      <div>
                        <p className="text-xs font-semibold text-slate-600 mb-1">Loan Office Notes</p>
                        <p className="text-slate-700 bg-slate-50 p-2 rounded text-xs leading-relaxed">{selectedReview.submission_memo}</p>
                      </div>
                    )}
                  </div>
                </details>
              )}

              <div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => openFdSheetPrintView(selectedReview)}
                >
                  <Download className="h-4 w-4 mr-1" />
                  Download FD Sheet (PDF)
                </Button>
              </div>

              {/* Decision Section */}
              <div className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-lg p-4 space-y-3">
                <p className="font-semibold text-sm text-slate-900">Your Decision</p>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="text-xs font-semibold text-slate-700">Verified FD Score (%)</label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      value={adjustedFdScore}
                      onChange={e => setAdjustedFdScore(e.target.value)}
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-700">Adjustment reason {Math.round(Number(adjustedFdScore) || 0) !== Math.round(Number(selectedReview.fd_score) || 0) ? '*' : '(if changed)'}</label>
                    <Textarea
                      placeholder="Required when the verified score differs from the generated score..."
                      value={adjustmentReason}
                      onChange={e => setAdjustmentReason(e.target.value)}
                      className="mt-2 min-h-16 text-sm"
                    />
                  </div>
                </div>
                
                <div>
                  <label className="text-xs font-semibold text-slate-700">Verification Findings *</label>
                  <Textarea
                    placeholder="Enter your verification findings and calculations..."
                    value={verificationMemo}
                    onChange={e => setVerificationMemo(e.target.value)}
                    className="mt-2 min-h-16 text-sm"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700">Decision Reason *</label>
                  <Textarea
                    placeholder="Enter approval or rejection reason..."
                    value={reviewDecision}
                    onChange={e => setReviewDecision(e.target.value)}
                    className="mt-2 min-h-12 text-sm"
                  />
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="flex-col-reverse gap-2 pt-4 border-t sm:flex-row">
            <Button
              variant="outline"
              onClick={() => setSelectedReview(null)}
              disabled={submitting}
              size="sm"
            >
              Cancel
            </Button>
            {/* Calculate if rejection is allowed based on FD score and loan type */}
            {(() => {
              const isExceptionLoanType = isFdExemptLoanTypeLocal(selectedReview?.loan_type, selectedReview?.loan_type)
              const fdScore = selectedReview?.fd_score ?? 0
              const canReject = selectedReview ? canRejectByScoreRule(selectedReview) : false

              return (
                <>
                  <Button
                    variant="destructive"
                    onClick={handleReject}
                    disabled={submitting || !reviewDecision || !canReject}
                    size="sm"
                    title={!canReject ? (isExceptionLoanType ? `${selectedReview?.loan_type} loans cannot be rejected - must be pushed to HR Loan Office` : `FD scores of ${GOOD_FD_THRESHOLD}% or higher cannot be rejected`) : ""}
                  >
                    <XCircle className="h-4 w-4 mr-1" />
                    Reject
                  </Button>
                  {!canReject && (
                    <div className="text-xs text-amber-600 bg-amber-50 p-2 rounded border border-amber-200">
                      <AlertCircle className="h-4 w-4 inline mr-1" />
                      {isExceptionLoanType 
                        ? `${selectedReview?.loan_type} loans must be approved and pushed to HR Loan Office regardless of FD score.`
                        : `FD Score ${fdScore}% is acceptable. Only scores below ${GOOD_FD_THRESHOLD}% can be rejected.`
                      }
                    </div>
                  )}
                </>
              )
            })()}
            <Button
              onClick={handleApprove}
              disabled={submitting || !verificationMemo}
              className="bg-emerald-600 hover:bg-emerald-700"
              size="sm"
            >
              <CheckCircle className="h-4 w-4 mr-1" />
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
