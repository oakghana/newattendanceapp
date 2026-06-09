'use client'

import { useState, useCallback, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react'

interface DefermentRequest {
  id: string
  user_id: string
  leave_plan_request_id: string
  requested_deferment_year: number
  requested_deferment_period: string
  reason?: string
  status: string
  created_at: string
  hod_decision?: string
  hod_decision_note?: string
  leave_plan_request?: {
    id: string
    user_id: string
    preferred_start_date: string
    preferred_end_date: string
    leave_type_key: string
    reason: string
    status: string
    created_at: string
  }
  user_profiles?: {
    id: string
    first_name: string
    last_name: string
    employee_id: string
    position: string
    department_id: string
    departments?: {
      name: string
    }
  }
}

interface Props {
  isOpen: boolean
  onClose: () => void
  request: DefermentRequest | null
  hodId: string
  onSuccess?: () => void
}

export function HodDefermentEndorsementModal({
  isOpen,
  onClose,
  request,
  hodId,
  onSuccess,
}: Props) {
  const [decision, setDecision] = useState<'approved' | 'rejected' | null>(null)
  const [decisionNote, setDecisionNote] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleSubmitDecision = useCallback(async () => {
    if (!decision || !request) {
      setError('Please select a decision')
      return
    }

    setIsLoading(true)
    setError(null)
    setSuccess(false)

    try {
      const response = await fetch('/api/leave/deferment/hod-endorsement', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: request.id,
          decision,
          decision_note: decisionNote || null,
          hod_reviewed_by: hodId,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to process endorsement')
      }

      setSuccess(true)
      setTimeout(() => {
        setDecision(null)
        setDecisionNote('')
        onClose()
        onSuccess?.()
      }, 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsLoading(false)
    }
  }, [decision, request, hodId, onClose, onSuccess])

  const handleClose = useCallback(() => {
    if (!isLoading) {
      setDecision(null)
      setDecisionNote('')
      setError(null)
      setSuccess(false)
      onClose()
    }
  }, [isLoading, onClose])

  if (!request) return null

  const staff = request.user_profiles
  const leave = request.leave_plan_request
  const leaveDays = leave
    ? Math.ceil((new Date(leave.preferred_end_date).getTime() - new Date(leave.preferred_start_date).getTime()) / (1000 * 60 * 60 * 24)) + 1
    : 0

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">Deferment Endorsement</DialogTitle>
          <DialogDescription>
            Review and endorse the deferment request for further processing
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Success State */}
          {success && (
            <Alert className="border-green-200 bg-green-50">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                {decision === 'approved'
                  ? 'Deferment request endorsed and forwarded to HR for processing.'
                  : 'Deferment request rejected.'}
              </AlertDescription>
            </Alert>
          )}

          {/* Error State */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Staff Information */}
          {staff && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Staff Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-slate-600">Name</p>
                    <p className="font-semibold text-slate-900">
                      {staff.first_name} {staff.last_name}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600">Employee ID</p>
                    <p className="font-semibold text-slate-900">#{staff.employee_id}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600">Position</p>
                    <p className="font-semibold text-slate-900">{staff.position}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600">Department</p>
                    <p className="font-semibold text-slate-900">
                      {staff.departments?.name || 'N/A'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Leave Details */}
          {leave && (
            <Card className="border-blue-200 bg-blue-50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Leave Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-slate-600">Period</p>
                    <p className="font-semibold text-slate-900">
                      {new Date(leave.preferred_start_date).toLocaleDateString()} -
                      <br />
                      {new Date(leave.preferred_end_date).toLocaleDateString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-600">Duration</p>
                    <p className="font-semibold text-slate-900">{leaveDays} days</p>
                  </div>
                  <div>
                    <p className="text-slate-600">Type</p>
                    <Badge className="mt-1 capitalize">{leave.leave_type_key}</Badge>
                  </div>
                </div>
                {leave.reason && (
                  <div>
                    <p className="text-sm text-slate-600">Reason</p>
                    <p className="text-slate-900 text-sm font-medium">{leave.reason}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Deferment Request Details */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Deferment Request</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-slate-600">Requested Year</p>
                  <p className="font-semibold text-slate-900">
                    {request.requested_deferment_period}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-600">Submitted</p>
                  <p className="font-semibold text-slate-900">
                    {new Date(request.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
              {request.reason && (
                <div>
                  <p className="text-sm text-slate-600">Reason</p>
                  <p className="text-slate-900 text-sm font-medium">{request.reason}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Decision Section */}
          <div className="space-y-4 pt-4 border-t">
            <div className="space-y-3">
              <label className="block text-sm font-semibold text-slate-700">
                Your Decision <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setDecision('approved')}
                  disabled={isLoading}
                  className={`p-4 rounded-lg border-2 transition-all text-center font-semibold ${
                    decision === 'approved'
                      ? 'border-green-500 bg-green-50 text-green-700'
                      : 'border-slate-200 hover:border-green-300 bg-slate-50 text-slate-700'
                  } disabled:opacity-50`}
                >
                  ✓ Approve & Forward to HR
                </button>
                <button
                  onClick={() => setDecision('rejected')}
                  disabled={isLoading}
                  className={`p-4 rounded-lg border-2 transition-all text-center font-semibold ${
                    decision === 'rejected'
                      ? 'border-red-500 bg-red-50 text-red-700'
                      : 'border-slate-200 hover:border-red-300 bg-slate-50 text-slate-700'
                  } disabled:opacity-50`}
                >
                  ✗ Reject
                </button>
              </div>
            </div>

            {/* Decision Note */}
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-slate-700">
                {decision === 'rejected' ? 'Rejection Reason' : 'Additional Notes'}
              </label>
              <Textarea
                placeholder={
                  decision === 'rejected'
                    ? 'Explain why you are rejecting this deferment request...'
                    : 'Add any additional notes (optional)...'
                }
                value={decisionNote}
                onChange={(e) => setDecisionNote(e.target.value)}
                disabled={isLoading || !decision}
                className="resize-none"
                rows={3}
              />
            </div>

            {/* Info Alert */}
            {decision === 'approved' && (
              <Alert className="border-blue-200 bg-blue-50">
                <AlertCircle className="h-4 w-4 text-blue-600" />
                <AlertDescription className="text-sm text-blue-700">
                  The deferment request will be forwarded to HR Leave Office for final approval. Staff will be notified of the outcome.
                </AlertDescription>
              </Alert>
            )}
            {decision === 'rejected' && (
              <Alert className="border-orange-200 bg-orange-50">
                <AlertCircle className="h-4 w-4 text-orange-600" />
                <AlertDescription className="text-sm text-orange-700">
                  Staff will be notified of the rejection with your reason. They can submit a new request later if needed.
                </AlertDescription>
              </Alert>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 justify-end">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isLoading}
            className="px-6"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmitDecision}
            disabled={!decision || isLoading}
            className={`px-6 ${
              decision === 'rejected'
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-green-600 hover:bg-green-700'
            }`}
          >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isLoading ? 'Processing...' : 'Submit Decision'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
