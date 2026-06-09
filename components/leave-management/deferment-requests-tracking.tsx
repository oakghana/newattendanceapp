'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, AlertCircle, Clock, CheckCircle, XCircle, ThumbsUp, ThumbsDown } from 'lucide-react'
import { HodDefermentEndorsementModal } from './hod-deferment-endorsement-modal'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from '@/components/ui/textarea'

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
  hod_reviewed_at?: string
  hr_office_decision?: string
  hr_office_reviewed_at?: string
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
  userRole: string
  userId: string
  userDepartmentId?: string
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'pending_hod_endorsement':
      return 'bg-yellow-100 text-yellow-800 border-yellow-200'
    case 'pending_hr_approval':
      return 'bg-blue-100 text-blue-800 border-blue-200'
    case 'approved':
    case 'hr_approved':
      return 'bg-green-100 text-green-800 border-green-200'
    case 'rejected':
    case 'hod_rejected':
      return 'bg-red-100 text-red-800 border-red-200'
    default:
      return 'bg-gray-100 text-gray-800 border-gray-200'
  }
}

const getStatusLabel = (status: string) => {
  switch (status) {
    case 'pending_hod_endorsement':
      return 'Awaiting HOD/RM Endorsement'
    case 'pending_hr_approval':
      return 'Awaiting HR Approval'
    case 'approved':
    case 'hr_approved':
      return 'Approved'
    case 'rejected':
    case 'hod_rejected':
      return 'Rejected'
    default:
      return status.replace(/_/g, ' ').toUpperCase()
  }
}

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'pending_hod_endorsement':
    case 'pending_hr_approval':
      return <Clock className="h-4 w-4" />
    case 'approved':
    case 'hr_approved':
      return <CheckCircle className="h-4 w-4" />
    case 'rejected':
    case 'hod_rejected':
      return <XCircle className="h-4 w-4" />
    default:
      return <AlertCircle className="h-4 w-4" />
  }
}

export function DefermentRequestsTracking({ userRole, userId, userDepartmentId }: Props) {
  const [requests, setRequests] = useState<DefermentRequest[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedRequest, setSelectedRequest] = useState<DefermentRequest | null>(null)
  const [showEndorsementModal, setShowEndorsementModal] = useState(false)
  const [approvalDialogOpen, setApprovalDialogOpen] = useState(false)
  const [rejectionDialogOpen, setRejectionDialogOpen] = useState(false)
  const [rejectionReason, setRejectionReason] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const roleNorm = userRole?.toLowerCase().replace(/[\s-]+/g, '_') || ''
  const isStaff = !['admin', 'regional_manager', 'department_head', 'hr_officer', 'hr_leave_office', 'hr_office', 'hr', 'manager_hr', 'director_hr', 'hr_director', 'hr_executive'].includes(roleNorm)
  const isHodOrRM = ['regional_manager', 'department_head'].includes(roleNorm)
  const isHRLeaveOffice = ['hr_leave_office', 'hr_office', 'hr'].includes(roleNorm)
  const isHrExecutive = ['hr_executive', 'hr_director', 'director_hr', 'manager_hr'].includes(roleNorm)

  const fetchRequests = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      let url = '/api/leave/deferment-recall/all?'
      
      // Add role-based parameters for the API
      const roleNorm = userRole?.toLowerCase().replace(/[\s-]+/g, '_') || ''
      url += `user_id=${encodeURIComponent(userId)}&user_role=${encodeURIComponent(roleNorm)}`
      
      if (userDepartmentId) {
        url += `&user_department=${encodeURIComponent(userDepartmentId)}`
      }

      const response = await fetch(url)
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to fetch deferment requests')
      }

      const data = await response.json()
      // The endpoint returns { deferments: [], recalls: [] }
      const allRequests = [
        ...(Array.isArray(data.deferments) ? data.deferments : []),
        ...(Array.isArray(data.recalls) ? data.recalls : [])
      ]
      setRequests(allRequests)
    } catch (err) {
      console.log("[v0] Deferment requests fetch error:", err)
      setError(err instanceof Error ? err.message : 'An error occurred')
      setRequests([])
    } finally {
      setIsLoading(false)
    }
  }, [userId, userRole, userDepartmentId])

  useEffect(() => {
    fetchRequests()
  }, [fetchRequests])

  const handleEndorsementSuccess = useCallback(() => {
    setShowEndorsementModal(false)
    setSelectedRequest(null)
    fetchRequests()
  }, [fetchRequests])

  const handleApprove = useCallback(async () => {
    if (!selectedRequest) return

    setIsSubmitting(true)
    try {
      const response = await fetch('/api/leave/deferment-recall/hr-executive-decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request_id: selectedRequest.id,
          request_type: 'deferment',
          decision: 'approved',
          hr_executive_id: userId,
          hr_executive_role: userRole,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to approve request')
      }

      setApprovalDialogOpen(false)
      setSelectedRequest(null)
      await fetchRequests()
    } catch (err) {
      console.error('[v0] Approval error:', err)
      alert(err instanceof Error ? err.message : 'Failed to approve request')
    } finally {
      setIsSubmitting(false)
    }
  }, [selectedRequest, userId, userRole, fetchRequests])

  const handleReject = useCallback(async () => {
    if (!selectedRequest) return

    setIsSubmitting(true)
    try {
      const response = await fetch('/api/leave/deferment-recall/hr-executive-decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request_id: selectedRequest.id,
          request_type: 'deferment',
          decision: 'rejected',
          rejection_reason: rejectionReason || 'Rejected by HR Executive',
          hr_executive_id: userId,
          hr_executive_role: userRole,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to reject request')
      }

      setRejectionDialogOpen(false)
      setRejectionReason('')
      setSelectedRequest(null)
      await fetchRequests()
    } catch (err) {
      console.error('[v0] Rejection error:', err)
      alert(err instanceof Error ? err.message : 'Failed to reject request')
    } finally {
      setIsSubmitting(false)
    }
  }, [selectedRequest, rejectionReason, userId, userRole, fetchRequests])

  const pendingHodRequests = requests.filter(r => r.status === 'pending_hod_endorsement')
  const pendingHrRequests = requests.filter(r => r.status === 'pending_hr_approval')
  const approvedRequests = requests.filter(r => ['approved', 'hr_approved'].includes(r.status))
  const rejectedRequests = requests.filter(r => ['rejected', 'hod_rejected'].includes(r.status))

  const renderRequestCard = (request: DefermentRequest) => {
    const staff = request.user_profiles
    const leave = request.leave_plan_request

    return (
      <Card key={request.id} className="hover:shadow-md transition-shadow">
        <CardContent className="pt-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <h4 className="font-semibold text-slate-900">
                {staff?.first_name} {staff?.last_name}
              </h4>
              <p className="text-sm text-slate-600">#{staff?.employee_id}</p>
            </div>
            <div className="flex items-center gap-2">
              {getStatusIcon(request.status)}
              <Badge variant="outline" className={`${getStatusColor(request.status)} border`}>
                {getStatusLabel(request.status)}
              </Badge>
            </div>
          </div>

          <div className="space-y-3 mb-4">
            {leave && (
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div>
                  <p className="text-slate-600">Leave Period</p>
                  <p className="font-medium text-slate-900">
                    {new Date(leave.preferred_start_date).toLocaleDateString()} -
                    {new Date(leave.preferred_end_date).toLocaleDateString()}
                  </p>
                </div>
                <div>
                  <p className="text-slate-600">Type</p>
                  <Badge className="mt-1 capitalize">{leave.leave_type_key}</Badge>
                </div>
                <div>
                  <p className="text-slate-600">Deferral Year</p>
                  <p className="font-medium text-slate-900">{request.requested_deferment_period}</p>
                </div>
              </div>
            )}

            {request.reason && (
              <div>
                <p className="text-sm text-slate-600">Reason</p>
                <p className="text-sm text-slate-900">{request.reason}</p>
              </div>
            )}

            {request.hod_decision_note && (
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <p className="text-xs text-slate-600 font-semibold">HOD/RM Note</p>
                <p className="text-sm text-slate-900">{request.hod_decision_note}</p>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-slate-500">
              {new Date(request.created_at).toLocaleDateString()}
            </p>

            <div className="flex items-center gap-2">
              {isHodOrRM && request.status === 'pending_hod_endorsement' && (
                <Button
                  size="sm"
                  onClick={() => {
                    setSelectedRequest(request)
                    setShowEndorsementModal(true)
                  }}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  Review & Endorse
                </Button>
              )}

              {isHrExecutive && request.status === 'pending_hr_approval' && (
                <>
                  <Button
                    size="sm"
                    onClick={() => {
                      setSelectedRequest(request)
                      setApprovalDialogOpen(true)
                    }}
                    disabled={isSubmitting}
                    className="bg-green-600 hover:bg-green-700 gap-1"
                  >
                    <ThumbsUp className="h-4 w-4" />
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setSelectedRequest(request)
                      setRejectionDialogOpen(true)
                    }}
                    disabled={isSubmitting}
                    className="border-red-300 text-red-700 hover:bg-red-50"
                  >
                    <ThumbsDown className="h-4 w-4" />
                    Reject
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    )
  }

  if (requests.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center">
        <p className="text-slate-500">
          {isStaff
            ? 'No deferment requests found'
            : isHodOrRM
            ? 'No pending endorsements'
            : 'No deferment requests to process'}
        </p>
      </div>
    )
  }

  // For staff: show all their requests
  if (isStaff) {
    return (
      <Tabs defaultValue="all" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="all">All ({requests.length})</TabsTrigger>
          <TabsTrigger value="pending">Pending ({pendingHodRequests.length + pendingHrRequests.length})</TabsTrigger>
          <TabsTrigger value="approved">Approved ({approvedRequests.length})</TabsTrigger>
          <TabsTrigger value="rejected">Rejected ({rejectedRequests.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-4 mt-4">
          {requests.map(renderRequestCard)}
        </TabsContent>

        <TabsContent value="pending" className="space-y-4 mt-4">
          {[...pendingHodRequests, ...pendingHrRequests].length === 0 ? (
            <p className="text-slate-500 text-center py-4">No pending requests</p>
          ) : (
            [...pendingHodRequests, ...pendingHrRequests].map(renderRequestCard)
          )}
        </TabsContent>

        <TabsContent value="approved" className="space-y-4 mt-4">
          {approvedRequests.length === 0 ? (
            <p className="text-slate-500 text-center py-4">No approved requests</p>
          ) : (
            approvedRequests.map(renderRequestCard)
          )}
        </TabsContent>

        <TabsContent value="rejected" className="space-y-4 mt-4">
          {rejectedRequests.length === 0 ? (
            <p className="text-slate-500 text-center py-4">No rejected requests</p>
          ) : (
            rejectedRequests.map(renderRequestCard)
          )}
        </TabsContent>
      </Tabs>
    )
  }

  // For HOD/RM: show pending endorsement requests
  if (isHodOrRM) {
    return (
      <div className="space-y-4">
        {pendingHodRequests.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center">
            <p className="text-slate-500">No pending deferment requests for endorsement</p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-4">
              <Clock className="h-5 w-5 text-blue-600" />
              <h3 className="font-semibold text-slate-900">
                Pending Endorsement ({pendingHodRequests.length})
              </h3>
            </div>
            {pendingHodRequests.map(renderRequestCard)}
          </>
        )}
      </div>
    )
  }

  // Approval Dialog
  const approvalContent = (
    <>
      <DialogHeader>
        <DialogTitle>Approve Deferment Request</DialogTitle>
        <DialogDescription>
          Are you sure you want to approve this deferment request? A memo will be automatically generated.
        </DialogDescription>
      </DialogHeader>

      {selectedRequest && (
        <div className="space-y-3 my-4">
          <div>
            <p className="text-sm font-medium text-slate-600">Staff Member</p>
            <p className="text-slate-900">{selectedRequest.user_profiles?.first_name} {selectedRequest.user_profiles?.last_name}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-slate-600">Deferment Period</p>
            <p className="text-slate-900">{selectedRequest.requested_deferment_period}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-slate-600">Reason</p>
            <p className="text-slate-900">{selectedRequest.reason || 'No reason provided'}</p>
          </div>
        </div>
      )}

      <DialogFooter>
        <Button
          variant="outline"
          onClick={() => setApprovalDialogOpen(false)}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button
          className="bg-green-600 hover:bg-green-700"
          onClick={handleApprove}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Approving...
            </>
          ) : (
            <>
              <ThumbsUp className="h-4 w-4 mr-2" />
              Approve
            </>
          )}
        </Button>
      </DialogFooter>
    </>
  )

  // Rejection Dialog
  const rejectionContent = (
    <>
      <DialogHeader>
        <DialogTitle>Reject Deferment Request</DialogTitle>
        <DialogDescription>
          Provide a reason for rejecting this deferment request.
        </DialogDescription>
      </DialogHeader>

      {selectedRequest && (
        <div className="space-y-4 my-4">
          <div>
            <p className="text-sm font-medium text-slate-600">Staff Member</p>
            <p className="text-slate-900">{selectedRequest.user_profiles?.first_name} {selectedRequest.user_profiles?.last_name}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-2">Rejection Reason</label>
            <Textarea
              placeholder="Provide a reason for rejecting this request..."
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              className="min-h-24"
              disabled={isSubmitting}
            />
          </div>
        </div>
      )}

      <DialogFooter>
        <Button
          variant="outline"
          onClick={() => setRejectionDialogOpen(false)}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button
          variant="destructive"
          onClick={handleReject}
          disabled={isSubmitting || !rejectionReason.trim()}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Rejecting...
            </>
          ) : (
            <>
              <ThumbsDown className="h-4 w-4 mr-2" />
              Reject
            </>
          )}
        </Button>
      </DialogFooter>
    </>
  )

  // For HR: show all deferment requests
  return (
    <>
      <Tabs defaultValue="pending" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="pending">Pending ({pendingHrRequests.length})</TabsTrigger>
          <TabsTrigger value="approved">Approved ({approvedRequests.length})</TabsTrigger>
          <TabsTrigger value="rejected">Rejected ({rejectedRequests.length})</TabsTrigger>
          <TabsTrigger value="all">All ({requests.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-4 mt-4">
          {pendingHrRequests.length === 0 ? (
            <p className="text-slate-500 text-center py-4">No pending requests</p>
          ) : (
            pendingHrRequests.map(renderRequestCard)
          )}
        </TabsContent>

        <TabsContent value="approved" className="space-y-4 mt-4">
          {approvedRequests.length === 0 ? (
            <p className="text-slate-500 text-center py-4">No approved requests</p>
          ) : (
            approvedRequests.map(renderRequestCard)
          )}
        </TabsContent>

        <TabsContent value="rejected" className="space-y-4 mt-4">
          {rejectedRequests.length === 0 ? (
            <p className="text-slate-500 text-center py-4">No rejected requests</p>
          ) : (
            rejectedRequests.map(renderRequestCard)
          )}
        </TabsContent>

        <TabsContent value="all" className="space-y-4 mt-4">
          {requests.map(renderRequestCard)}
        </TabsContent>
      </Tabs>

      <Dialog open={approvalDialogOpen} onOpenChange={setApprovalDialogOpen}>
        <DialogContent>
          {approvalContent}
        </DialogContent>
      </Dialog>

      <Dialog open={rejectionDialogOpen} onOpenChange={setRejectionDialogOpen}>
        <DialogContent>
          {rejectionContent}
        </DialogContent>
      </Dialog>

      {selectedRequest && (
        <HodDefermentEndorsementModal
          request={selectedRequest}
          open={showEndorsementModal}
          onOpenChange={setShowEndorsementModal}
          onSuccess={handleEndorsementSuccess}
        />
      )}
    </>
  )
}
