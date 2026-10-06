'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Clock, User, Calendar, CheckCircle2, XCircle, Loader2, AlertCircle, Edit2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { useToast } from '@/hooks/use-toast'
import { HODResumptionConfirmations } from './hod-resumption-confirmations'

interface HODReviewSectionProps {
  userDepartmentId: string
  viewerRole?: string | null
}

interface LeaveRequest {
  id: string
  staff_name?: string
  staff_id?: string
  user_profiles?: {
    first_name?: string
    last_name?: string
    employee_id?: string
    departments?: { name?: string }
  }
  leave_type?: string
  start_date?: string
  end_date?: string
  status?: string
  hod_review_status?: string
  created_at?: string
  daysPending?: number
  staff_location?: { name?: string; code?: string; region_id?: string } | null
  hod_linkages?: Array<{ id: string; name?: string; employee_id?: string; position?: string; role?: string; email?: string }>
}

export function HODReviewSection({ userDepartmentId, viewerRole }: HODReviewSectionProps) {
  const [requests, setRequests] = useState<LeaveRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actingId, setActingId] = useState<string | null>(null)
  const [rejectTarget, setRejectTarget] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [editTarget, setEditTarget] = useState<string | null>(null)
  const [editStartDate, setEditStartDate] = useState('')
  const [editEndDate, setEditEndDate] = useState('')
  const { toast } = useToast()

  useEffect(() => {
    fetchDepartmentRequests()
  }, [userDepartmentId])

  const fetchDepartmentRequests = async () => {
    try {
      setLoading(true)
      setError(null)

      // Fetch pending HOD review requests
      const res = await fetch('/api/leave/hod-pending-requests')

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`)
      }

      const data = await res.json().catch(() => ({}))
      if (!data || typeof data !== 'object') {
        throw new Error('The HOD review response was invalid')
      }

      // The API already scopes requests to the authenticated HOD (by explicit
      // hod_user_id assignment or active staff-to-HOD linkage), so no further
      // client-side department filtering is applied here. A previous filter
      // checked req.user_profiles.departments.name, a field the API never
      // returns, which silently hid every request from this view.
      const requests = Array.isArray(data.requests) ? data.requests : []

      setRequests(requests)
    } catch (err) {
      console.error('[v0] HOD Review fetch error:', err)
      setError('Failed to load HOD review requests')
    } finally {
      setLoading(false)
    }
  }

  const getAgingColor = (daysPending: number | undefined) => {
    if (!daysPending) return 'bg-gray-100 text-gray-700'
    if (daysPending < 3) return 'bg-green-100 text-green-700'
    if (daysPending < 7) return 'bg-amber-100 text-amber-700'
    return 'bg-red-100 text-red-700'
  }

  const submitDecision = async (requestId: string, action: 'approve' | 'reject', recommendation?: string) => {
    setActingId(requestId)
    try {
      const res = await fetch('/api/leave/planning/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leave_plan_request_id: requestId, action, recommendation: recommendation || undefined }),
      })
      const json = await res.json().catch(() => ({}))

      if (!res.ok) {
        // 409 means another HOD/RM linked to this staff member already
        // acted on this request first — remove it from this view instead
        // of letting the user retry an action that can no longer apply.
        if (res.status === 409) {
          setRequests((prev) => prev.filter((r) => r.id !== requestId))
          toast({
            title: 'Already handled',
            description: json.error || 'Another supervisor already reviewed this request.',
          })
          return
        }
        throw new Error(json.error || `Failed to ${action} request`)
      }

      toast({
        title: 'Success',
        description: action === 'approve' ? 'Leave request approved' : 'Leave request rejected',
      })
      fetchDepartmentRequests()
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : `Failed to ${action} request`,
        variant: 'destructive',
      })
    } finally {
      setActingId(null)
    }
  }

  const handleApprove = (requestId: string) => submitDecision(requestId, 'approve')

  const openRejectDialog = (requestId: string) => {
    setRejectReason('')
    setRejectTarget(requestId)
  }

  const confirmReject = async () => {
    if (!rejectTarget || !rejectReason.trim()) return
    const requestId = rejectTarget
    setRejectTarget(null)
    await submitDecision(requestId, 'reject', rejectReason.trim())
  }

  const openEditDatesDialog = (requestId: string, currentStartDate?: string, currentEndDate?: string) => {
    setEditTarget(requestId)
    setEditStartDate(currentStartDate ? new Date(currentStartDate).toISOString().split('T')[0] : '')
    setEditEndDate(currentEndDate ? new Date(currentEndDate).toISOString().split('T')[0] : '')
  }

  const submitDateUpdate = async () => {
    if (!editTarget || !editStartDate || !editEndDate) return

    setActingId(editTarget)
    try {
      const res = await fetch('/api/leave/planning/hod-update-dates', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leave_plan_request_id: editTarget,
          start_date: editStartDate,
          end_date: editEndDate,
        }),
      })
      const json = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(json.error || 'Failed to update dates')
      }

      toast({
        title: 'Success',
        description: `Leave dates updated: ${editStartDate} to ${editEndDate}`,
      })
      setEditTarget(null)
      fetchDepartmentRequests()
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to update dates',
        variant: 'destructive',
      })
    } finally {
      setActingId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
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
      <Card>
        <CardContent className="pt-6 text-center text-muted-foreground">
          <CheckCircle2 className="h-12 w-12 mx-auto mb-2 text-green-500" />
          <p>No pending HOD review requests for your department</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Pending HOD Review Section */}
      <div>
        <h3 className="text-sm font-semibold mb-3 text-slate-700">Pending Review</h3>
        <div className="space-y-4">
          {requests.map((req) => {
        const staffName =
          `${req.user_profiles?.first_name || ''} ${req.user_profiles?.last_name || ''}`.trim() ||
          req.staff_name ||
          'Unknown'
        const employeeId = req.user_profiles?.employee_id || req.staff_id || 'N/A'
        const deptName = req.user_profiles?.departments?.name || 'N/A'
        const daysPending = req.daysPending || 0

        return (
          <Card key={req.id} className="hover:shadow-md transition-shadow">
            <CardContent className="pt-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{staffName}</p>
                      <p className="text-xs text-muted-foreground">{employeeId}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Badge variant="outline">{deptName}</Badge>
                    <Badge>{req.leave_type || 'Leave'}</Badge>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="flex items-center gap-1">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span>
                        {req.start_date
                          ? new Date(req.start_date).toLocaleDateString()
                          : 'N/A'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span>
                        {req.end_date
                          ? new Date(req.end_date).toLocaleDateString()
                          : 'N/A'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <Badge className={getAgingColor(daysPending)}>
                      {daysPending} days pending
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="mt-4 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm md:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Staff location</p>
                  <p className="font-medium text-slate-800">
                    {req.staff_location?.name || 'Location not assigned'}{req.staff_location?.code ? ` (${req.staff_location.code})` : ''}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">HOD linkage</p>
                  {req.hod_linkages?.length ? req.hod_linkages.map((hod) => (
                    <p key={hod.id} className="font-medium text-slate-800">
                      {hod.name || 'Unnamed HOD'}{hod.employee_id ? ` · ${hod.employee_id}` : ''}
                      {hod.position ? ` · ${hod.position}` : ''}
                    </p>
                  )) : <p className="font-medium text-amber-700">No HOD linkage found</p>}
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={actingId === req.id}
                  onClick={() => openEditDatesDialog(req.id, req.start_date, req.end_date)}
                >
                  <Edit2 className="h-4 w-4 mr-1" />
                  Edit Dates
                </Button>
                <Button
                  size="sm"
                  variant="default"
                  className="bg-green-600 hover:bg-green-700"
                  disabled={actingId === req.id}
                  onClick={() => handleApprove(req.id)}
                >
                  {actingId === req.id ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 mr-1" />
                  )}
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={actingId === req.id}
                  onClick={() => openRejectDialog(req.id)}
                >
                  <XCircle className="h-4 w-4 mr-1" />
                  Deny
                </Button>
              </div>
            </CardContent>
          </Card>
        )
      })}
        </div>
      </div>

      <Dialog open={Boolean(editTarget)} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Leave Dates</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Start Date</label>
              <Input
                type="date"
                value={editStartDate}
                onChange={(e) => setEditStartDate(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">End Date</label>
              <Input
                type="date"
                value={editEndDate}
                onChange={(e) => setEditEndDate(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>
              Cancel
            </Button>
            <Button
              disabled={!editStartDate || !editEndDate || actingId === editTarget}
              onClick={submitDateUpdate}
            >
              {actingId === editTarget ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  Updating...
                </>
              ) : (
                <>
                  <Edit2 className="h-4 w-4 mr-1" />
                  Update Dates
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(rejectTarget)} onOpenChange={(open) => !open && setRejectTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reason for rejecting this leave request</DialogTitle>
          </DialogHeader>
          <Textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Explain why this leave request is being rejected"
            rows={4}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={!rejectReason.trim()} onClick={confirmReject}>
              <XCircle className="h-4 w-4 mr-1" />
              Confirm Rejection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* HOD Resumption Confirmations Section */}
      <div>
        <h3 className="text-sm font-semibold mb-3 text-slate-700">Staff Resumption Confirmations</h3>
        <p className="text-xs text-slate-500 mb-3">Confirm that staff members have resumed work after their approved leave</p>
        <HODResumptionConfirmations viewerRole={viewerRole || 'department_head'} />
      </div>
    </div>
  )
}
