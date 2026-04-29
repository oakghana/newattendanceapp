'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { MapPin, User, Clock, AlertTriangle, Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface PendingRequest {
  id: string
  user_id: string
  current_location_name: string
  latitude: number
  longitude: number
  accuracy: number
  device_info: string
  created_at: string
  status: string
  google_maps_name?: string
  user_profiles?: {
    id?: string
    first_name?: string
    last_name?: string
    email?: string
    department_id?: string
    employee_id?: string
    position?: string
    assigned_location_id?: string
  }
}

interface OffPremisesRequestModalProps {
  isOpen: boolean
  onClose: () => void
  request: PendingRequest
  onApprovalComplete: () => void
}

export function OffPremisesRequestModal({
  isOpen,
  onClose,
  request,
  onApprovalComplete,
}: OffPremisesRequestModalProps) {
  const [isApproving, setIsApproving] = useState(false)
  const [approvalComments, setApprovalComments] = useState('')
  const { toast } = useToast()

  const handleApprove = async (approved: boolean) => {
    if (isApproving) return

    setIsApproving(true)
    try {
      // Get current user
      const supabase = createClient()
      const { data: { user: currentUser } } = await supabase.auth.getUser()

      if (!currentUser?.id) {
        throw new Error('User not authenticated')
      }

      const response = await fetch('/api/attendance/offpremises/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request_id: request.id,
          approved,
          comments: approvalComments,
          user_id: currentUser.id,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        const message = result.error || 'Failed to process request'

        if (String(message).toLowerCase().includes('already been processed')) {
          toast({
            title: 'Request already updated',
            description: 'This off-premises request was already handled. The list will refresh now.',
          })
          onClose()
          onApprovalComplete()
          return
        }

        throw new Error(message)
      }

      // Show toast (success or rejection) with action link and close modal
      toast({
        title: approved ? 'Off‑Premises Request Approved' : 'Off‑Premises Request Rejected',
        description: approved
          ? `${request.user_profiles?.first_name || 'Unknown User'} has been checked in and marked as on official duty outside premises.`
          : `The off‑premises check‑in request has been rejected.`,
        action: (
          <Button asChild variant="outline">
            <a href="/offpremises-approvals">View Requests</a>
          </Button>
        ),
        className: approved ? 'border-emerald-400 bg-emerald-50 text-emerald-900' : undefined,
      })

      // Close modal and refresh immediately
      onClose()
      onApprovalComplete()
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to process the request',
        variant: 'destructive',
      })
    } finally {
      setIsApproving(false)
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }

  const mapUrl = `https://www.google.com/maps?q=${request.latitude},${request.longitude}`

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-600" />
            {request.request_type === 'checkout' ? 'Review Off‑Premises Check‑Out Request' : 'Review Off‑Premises Check‑In Request'}
          </DialogTitle>
          <DialogDescription>
            {request.request_type === 'checkout'
              ? 'Staff member is requesting to check out remotely from their current off‑premises location.'
              : 'Staff member is requesting to check in from outside their assigned QCC location'}
          </DialogDescription>
        </DialogHeader>
        {request.request_type === 'checkout' && (
          <Alert className="mt-2 border-blue-200 bg-blue-50">
            <AlertTitle>Checkout Request Review</AlertTitle>
            <AlertDescription>
              This is an off-premises check-out request. If approved, the user will be checked out remotely and the original request coordinates/time will be recorded on attendance.
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-4 py-4">
          {/* Staff Member Information */}
          <div className="border rounded-lg p-4 bg-gray-50 dark:bg-gray-900/50">
            <h3 className="font-semibold mb-3 text-sm text-gray-700 dark:text-gray-300">
              Staff Member Information
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-gray-500" />
                <div>
                  <p className="font-medium">
                    {request.user_profiles?.first_name || 'Unknown'} {request.user_profiles?.last_name || ''}
                  </p>
                  <p className="text-gray-600 dark:text-gray-400">{request.user_profiles?.email || 'No email'}</p>
                </div>
              </div>
              {request.user_profiles?.employee_id && (
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-gray-500" />
                  <span>Employee ID: {request.user_profiles?.employee_id}</span>
                </div>
              )}
              {request.user_profiles?.position && (
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-gray-500" />
                  <span>Position: {request.user_profiles?.position}</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-gray-500" />
                <span>Request Time: {formatDate(request.created_at)}</span>
              </div>
            </div>
          </div>

          {/* Current Location Information */}
          <div className="border rounded-lg p-4 bg-blue-50 dark:bg-blue-900/20">
            <h3 className="font-semibold mb-3 text-sm text-blue-900 dark:text-blue-300">
              Current Location
            </h3>
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <MapPin className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="font-medium text-blue-900 dark:text-blue-100">
                    {request.google_maps_name || request.current_location_name}
                  </p>
                  {request.google_maps_name && request.google_maps_name !== request.current_location_name && (
                    <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                      Alternative Name: {request.current_location_name}
                    </p>
                  )}
                  <p className="text-sm text-blue-700 dark:text-blue-300 mt-2">
                    Latitude: {request.latitude.toFixed(6)}
                    <br />
                    Longitude: {request.longitude.toFixed(6)}
                    <br />
                    GPS Accuracy: ±{request.accuracy.toFixed(0)}m
                  </p>
                  <a
                    href={mapUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:underline dark:text-blue-400 mt-2 inline-block"
                  >
                    View on Google Maps →
                  </a>
                </div>
              </div>
            </div>
          </div>

          {/* Staff-provided reason (visible to approver) */}
          <div className="border rounded-lg p-4 bg-white/50">
            <h4 className="font-semibold text-sm mb-2">Staff Reason</h4>
            <p className="text-sm text-foreground whitespace-pre-wrap">{request.reason || 'Not provided'}</p>
          </div>

          {/* Approval Questions */}
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Before You Approve</AlertTitle>
            <AlertDescription>
              <ul className="list-disc ml-5 mt-2 space-y-1 text-sm">
                {request.request_type === 'checkout' ? (
                  <>
                    <li>Is the staff member currently checked in and awaiting check‑out?</li>
                    <li>Is this check‑out being performed on official duty from an off‑premises site?</li>
                    <li>Do the recorded coordinates match the staff's reported location?</li>
                  </>
                ) : (
                  <>
                    <li>Did you send this staff member to this location on official duty?</li>
                    <li>Are they unable to come to their registered QCC location to check in?</li>
                    <li>Should they be marked as on official duty outside their premises today?</li>
                  </>
                )}
              </ul>
            </AlertDescription>
          </Alert>

          {/* Comments Field */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Approval Comments (Optional)
            </label>
            <Textarea
              placeholder="Add comments about your approval/rejection decision..."
              value={approvalComments}
              onChange={(e) => setApprovalComments(e.target.value)}
              className="min-h-20"
            />
          </div>

          {/* Information Message */}
          <Alert className="bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-900/50">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertTitle className="text-green-900 dark:text-green-300">What Happens If Approved</AlertTitle>
            <AlertDescription className="text-green-800 dark:text-green-400 text-sm mt-1">
              {request.request_type === 'checkout' ? (
                'If approved the staff member will be checked out remotely — the check‑out time and coordinates from the original request will be recorded on their attendance for today.'
              ) : (
                'The staff member will be automatically checked in to their assigned QCC location and marked as working on official duty outside premises. Their actual location will be recorded for audit purposes.'
              )}
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end pt-4 border-t">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isApproving}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => handleApprove(false)}
            disabled={isApproving}
            className="gap-2 w-full sm:w-auto"
          >
            {isApproving ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
            Reject Request
          </Button>
          <Button
            onClick={() => handleApprove(true)}
            disabled={isApproving}
            className="bg-green-600 hover:bg-green-700 gap-2 w-full sm:w-auto"
          >
            {isApproving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {request.request_type === 'checkout' ? 'Approve & Check Out' : 'Approve & Check In'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
