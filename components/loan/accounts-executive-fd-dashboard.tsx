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
              <div className="font-medium">{(data.net_to_gross_ratio * 100).toFixed(2)}%</div>
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

export function AccountsExecutiveFDDashboard({ userId, userRole }: { userId: string; userRole: string }) {
  const [reviews, setReviews] = useState<FDReview[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedReview, setSelectedReview] = useState<FDReview | null>(null)
  const [verificationMemo, setVerificationMemo] = useState('')
  const [reviewDecision, setReviewDecision] = useState('')
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
        setReviews(data.reviews || [])
      } else {
        toast({ title: 'Error', description: data.error, variant: 'destructive' })
      }
    } catch (error) {
      console.error('[v0] Error fetching FD reviews:', error)
      toast({ title: 'Error', description: 'Failed to load FD reviews', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  const isPoorFD = (review: FDReview): boolean => {
    // Auto-reject if FD score is below threshold or marked as poor
    return (review.fd_good === false) || (typeof review.fd_score === 'number' && review.fd_score < 39)
  }

  const handleAutoRejectPoorFD = async (review: FDReview) => {
    try {
      setSubmitting(true)
      const res = await fetch('/api/loan/fd-review', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          review_id: review.id,
          review_status: 'rejected',
          fd_verification_memo: 'Auto-rejected: FD score below acceptable threshold (< 39)',
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
        }),
      })

      const data = await res.json()

      if (data.success) {
        toast({ title: 'Success', description: 'FD request approved and sent to HR Leave Office' })
        setSelectedReview(null)
        setVerificationMemo('')
        setReviewDecision('')
        fetchPendingReviews()
      } else {
        toast({ title: 'Error', description: data.error, variant: 'destructive' })
      }
    } catch (error) {
      console.error('[v0] Error approving FD:', error)
      toast({ title: 'Error', description: 'Failed to approve FD request', variant: 'destructive' })
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
            const poorFD = isPoorFD(review)
            const borderColor = poorFD ? 'border-l-red-400' : 'border-l-amber-400'
            const badgeVariant = poorFD ? 'destructive' : 'outline'
            const badgeClass = poorFD ? 'bg-red-50 text-red-700 border-red-300' : 'bg-amber-50 text-amber-700 border-amber-300'
            
            return (
            <Card key={review.id} className={`border-l-4 ${borderColor}`}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between mb-4">
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
                  <div className="flex gap-2">
                    {poorFD && (
                      <Badge variant="destructive" className="bg-red-50 text-red-700 border border-red-300">
                        <AlertCircle className="h-3 w-3 mr-1" />
                        Poor FD
                      </Badge>
                    )}
                    <Badge variant="outline" className={badgeClass}>
                      <Clock className="h-3 w-3 mr-1" />
                      {poorFD ? 'Action Required' : 'Pending'}
                    </Badge>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-4 mb-4 p-3 bg-slate-50 rounded">
                  <div>
                    <p className="text-xs text-slate-500">FD Value</p>
                    <p className="font-bold text-lg">₵{review.fd_value.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">FD Score</p>
                    <p className={`font-bold text-lg ${(review.fd_score ?? 0) < 39 ? 'text-red-600' : 'text-green-600'}`}>
                      {review.fd_score ?? 'N/A'}
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
                    <p className="text-blue-800">{review.submission_memo}</p>
                  </div>
                )}

                {poorFD ? (
                  <div className="space-y-2">
                    <div className="p-3 bg-red-50 border border-red-200 rounded text-sm">
                      <p className="text-xs font-semibold text-red-900 mb-1">
                        <AlertCircle className="h-3 w-3 inline mr-1" />
                        Poor FD Detected
                      </p>
                      <p className="text-red-800">
                        FD score {review.fd_score} is below the acceptable threshold (39). This will be automatically rejected.
                      </p>
                    </div>
                    <Button
                      onClick={() => handleAutoRejectPoorFD(review)}
                      disabled={submitting}
                      className="w-full bg-red-600 hover:bg-red-700"
                    >
                      <XCircle className="h-4 w-4 mr-1" />
                      Auto-Reject Poor FD
                    </Button>
                  </div>
                ) : (
                  <Button
                    onClick={() => setSelectedReview(review)}
                    className="w-full"
                    variant="outline"
                  >
                    Review & Approve
                  </Button>
                )}
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
                <div className={`px-3 py-1 rounded text-sm font-semibold whitespace-nowrap ${(selectedReview.fd_score ?? 0) >= 39 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                  Score: {selectedReview.fd_score ?? 'N/A'}/100
                </div>
              )}
            </div>
          </DialogHeader>

          {selectedReview && (
            <div className="space-y-3">
              {/* Quick Info Row */}
              <div className="grid grid-cols-4 gap-3">
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

              {/* Decision Section */}
              <div className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-lg p-4 space-y-3">
                <p className="font-semibold text-sm text-slate-900">Your Decision</p>
                
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

          <DialogFooter className="gap-2 pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => setSelectedReview(null)}
              disabled={submitting}
              size="sm"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={submitting || !reviewDecision}
              size="sm"
            >
              <XCircle className="h-4 w-4 mr-1" />
              Reject
            </Button>
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
