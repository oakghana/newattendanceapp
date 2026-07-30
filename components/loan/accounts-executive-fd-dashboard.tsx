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
  leave_type: string
  leave_start_date: string
  leave_end_date: string
  fd_value: number
  supporting_docs_url: string
  submission_date: string
  submission_memo: string
  review_status: 'pending_review' | 'approved' | 'rejected'
}

export function AccountsExecutiveFDDashboard({ userId }: { userId: string }) {
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
          {reviews.map(review => (
            <Card key={review.id} className="border-l-4 border-l-amber-400">
              <CardContent className="pt-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <p className="font-semibold text-sm">{review.leave_type} Leave</p>
                    <p className="text-xs text-slate-500">
                      {new Date(review.leave_start_date).toLocaleDateString()} to {new Date(review.leave_end_date).toLocaleDateString()}
                    </p>
                  </div>
                  <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300">
                    <Clock className="h-3 w-3 mr-1" />
                    Pending
                  </Badge>
                </div>

                <div className="grid grid-cols-3 gap-4 mb-4 p-3 bg-slate-50 rounded">
                  <div>
                    <p className="text-xs text-slate-500">FD Value</p>
                    <p className="font-bold text-lg">₵{review.fd_value.toFixed(2)}</p>
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

                <Button
                  onClick={() => setSelectedReview(review)}
                  className="w-full"
                  variant="outline"
                >
                  Review & Verify
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Review Dialog */}
      <Dialog open={!!selectedReview} onOpenChange={open => !open && setSelectedReview(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>FD Verification Review</DialogTitle>
            <DialogDescription>
              Verify the FD calculation and supporting documentation. Add your verification memo before approval/rejection.
            </DialogDescription>
          </DialogHeader>

          {selectedReview && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded">
                <div>
                  <p className="text-xs font-semibold text-slate-600">Leave Period</p>
                  <p className="text-sm">
                    {new Date(selectedReview.leave_start_date).toLocaleDateString()} to{' '}
                    {new Date(selectedReview.leave_end_date).toLocaleDateString()}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-600">FD Value Claimed</p>
                  <p className="text-lg font-bold text-amber-600">₵{selectedReview.fd_value.toFixed(2)}</p>
                </div>
              </div>

              <div>
                <label className="text-sm font-semibold">FD Verification Memo</label>
                <Textarea
                  placeholder="Enter your verification findings and calculations..."
                  value={verificationMemo}
                  onChange={e => setVerificationMemo(e.target.value)}
                  className="mt-2 min-h-24"
                />
              </div>

              <div>
                <label className="text-sm font-semibold">Decision Notes</label>
                <Textarea
                  placeholder="Enter your decision notes (approval or rejection reason)..."
                  value={reviewDecision}
                  onChange={e => setReviewDecision(e.target.value)}
                  className="mt-2 min-h-16"
                />
              </div>

              <div className="p-3 bg-blue-50 border border-blue-200 rounded text-sm">
                <p className="text-xs font-semibold text-blue-900 mb-1">Original Loan Office Memo:</p>
                <p className="text-blue-800">{selectedReview.submission_memo}</p>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setSelectedReview(null)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={submitting || !reviewDecision}
            >
              <XCircle className="h-4 w-4 mr-1" />
              Reject
            </Button>
            <Button
              onClick={handleApprove}
              disabled={submitting || !verificationMemo}
              className="bg-emerald-600 hover:bg-emerald-700"
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
