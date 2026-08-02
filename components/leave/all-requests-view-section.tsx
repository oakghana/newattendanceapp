'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Clock, User, Calendar, AlertCircle, Loader2, Search, Download, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { getResumptionRowClass, getDaysOverdue } from '@/lib/resumption-confirmation-helpers'

interface LeaveRequest {
  id: string
  staff_name?: string
  user_id?: string
  leave_resumption_id?: string
  staff_confirmed?: boolean
  staff_confirmed_at?: string
  hod_confirmed?: boolean
  hod_confirmed_at?: string
  user_profiles?: {
    first_name?: string
    last_name?: string
    employee_id?: string
    department_name?: string
    position?: string
    full_name?: string
    departments?: { name?: string }
  }
  leave_type?: string
  leave_type_key?: string
  start_date?: string
  end_date?: string
  preferred_start_date?: string
  preferred_end_date?: string
  status?: string
  hod_review_status?: string
  hod_decision?: string
  created_at?: string
  staff_category?: string
}

interface ConfirmationModalState {
  isOpen: boolean
  request: LeaveRequest | null
  confirmationStatus: 'pending_hod_rm' | 'pending_hr_manual' | null
  notes: string
  isSubmitting: boolean
}

export function AllRequestsViewSection() {
  const { toast } = useToast()
  const [requests, setRequests] = useState<LeaveRequest[]>([])
  const [filteredRequests, setFilteredRequests] = useState<LeaveRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [confirmationModal, setConfirmationModal] = useState<ConfirmationModalState>({
    isOpen: false,
    request: null,
    confirmationStatus: null,
    notes: '',
    isSubmitting: false,
  })

  useEffect(() => {
    fetchAllRequests()
  }, [])

  useEffect(() => {
    // Filter requests based on search term
    const filtered = requests.filter((req) => {
      const staffName = (
        req.user_profiles?.full_name ||
        `${req.user_profiles?.first_name || ''} ${req.user_profiles?.last_name || ''}`.trim() ||
        req.staff_name || ''
      ).toLowerCase()
      const deptName = (req.user_profiles?.department_name || req.user_profiles?.departments?.name || '').toLowerCase()
      const empId = (req.user_profiles?.employee_id || '').toLowerCase()
      const leaveType = (req.leave_type || req.leave_type_key || '').toLowerCase()
      const searchLower = searchTerm.toLowerCase()

      return staffName.includes(searchLower) || deptName.includes(searchLower) ||
             empId.includes(searchLower) || leaveType.includes(searchLower)
    })
    setFilteredRequests(filtered)
  }, [searchTerm, requests])

  const fetchAllRequests = async () => {
    try {
      setLoading(true)
      setError(null)

      const res = await fetch('/api/leave/requests?limit=1000')

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`)
      }

      const responseData = await res.json()
      
      // Extract data from response - handle multiple possible response formats
      let requestsList: LeaveRequest[] = []
      
      if (Array.isArray(responseData.data)) {
        requestsList = responseData.data
      } else if (Array.isArray(responseData.records)) {
        requestsList = responseData.records
      } else if (Array.isArray(responseData)) {
        requestsList = responseData
      }
      
      setRequests(requestsList)
    } catch (err) {
      console.error('[v0] All requests fetch error:', err)
      setError(err instanceof Error ? err.message : 'Failed to load requests')
    } finally {
      setLoading(false)
    }
  }

  const getStatusBadge = (status: string | undefined) => {
    switch (status?.toLowerCase()) {
      case 'approved':
        return <Badge className="bg-green-100 text-green-700">Approved</Badge>
      case 'rejected':
        return <Badge className="bg-red-100 text-red-700">Rejected</Badge>
      case 'pending':
        return <Badge className="bg-yellow-100 text-yellow-700">Pending</Badge>
      default:
        return <Badge variant="outline">{status || 'Unknown'}</Badge>
    }
  }

  const getHodStatusBadge = (status: string | undefined) => {
    switch (status?.toLowerCase()) {
      case 'approved':
        return <Badge className="bg-blue-100 text-blue-700">HOD Approved</Badge>
      case 'rejected':
        return <Badge className="bg-red-100 text-red-700">HOD Rejected</Badge>
      case 'pending':
        return <Badge className="bg-orange-100 text-orange-700">Pending HOD</Badge>
      default:
        return <Badge variant="outline">-</Badge>
    }
  }

  const downloadLeaveMemo = async (requestId: string, staffName: string) => {
    setDownloadingId(requestId)
    try {
      // Fetch the leave memo document from the endpoint
      const res = await fetch(`/api/leave/download-memo?request_id=${requestId}`)
      
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Failed to fetch memo' }))
        throw new Error(errData.error || 'Failed to download leave memo')
      }

      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Leave_Memo_${staffName.replace(/\s+/g, '_')}_${new Date().getTime()}.pdf`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      toast({ title: 'Success', description: 'Leave memo downloaded successfully' })
    } catch (err) {
      console.error('[v0] Download memo error:', err)
      const errorMsg = err instanceof Error ? (err.message || 'Failed to download leave memo') : 'Failed to download leave memo'
      toast({
        title: 'Error',
        description: String(errorMsg),
        variant: 'destructive',
      })
    } finally {
      setDownloadingId(null)
    }
  }

  const openConfirmationModal = (request: LeaveRequest, status: 'pending_hod_rm' | 'pending_hr_manual') => {
    setConfirmationModal({
      isOpen: true,
      request,
      confirmationStatus: status,
      notes: '',
      isSubmitting: false,
    })
  }

  const handleConfirmation = async (action: 'confirmed' | 'rejected') => {
    if (!confirmationModal.request) return
    
    setConfirmationModal(prev => ({ ...prev, isSubmitting: true }))
    try {
      const res = await fetch('/api/leave/resumption/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leave_resumption_id: confirmationModal.request.leave_resumption_id,
          action,
          notes: confirmationModal.notes,
          confirmation_type: confirmationModal.confirmationStatus,
        }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Failed to confirm resumption')
      }

      toast({
        title: 'Success',
        description: `Resumption ${action === 'confirmed' ? 'confirmed' : 'rejected'} successfully`,
      })

      setConfirmationModal({ isOpen: false, request: null, confirmationStatus: null, notes: '', isSubmitting: false })
      fetchAllRequests()
    } catch (err) {
      console.error('[v0] Confirmation error:', err)
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to process confirmation',
        variant: 'destructive',
      })
    } finally {
      setConfirmationModal(prev => ({ ...prev, isSubmitting: false }))
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

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by staff name, department, or employee ID..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {filteredRequests.length === 0 && requests.length > 0 ? (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">
            <p>No requests match your search</p>
          </CardContent>
        </Card>
      ) : filteredRequests.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">
            <p>No leave requests found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead>Staff Name</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Leave Type</TableHead>
                <TableHead>Start Date</TableHead>
                <TableHead>End Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>HOD Review</TableHead>
                <TableHead className="text-center">Staff Confirmed</TableHead>
                <TableHead className="text-center">HOD Confirmed</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRequests.map((req) => {
                const staffName =
                  req.user_profiles?.full_name ||
                  `${req.user_profiles?.first_name || ''} ${req.user_profiles?.last_name || ''}`.trim() ||
                  req.staff_name ||
                  'Unknown'
                const deptName =
                  req.user_profiles?.department_name ||
                  req.user_profiles?.departments?.name ||
                  'N/A'
                const startDate = (req.start_date || req.preferred_start_date)
                  ? new Date(req.start_date || req.preferred_start_date!).toLocaleDateString()
                  : 'N/A'
                const endDate = (req.end_date || req.preferred_end_date)
                  ? new Date(req.end_date || req.preferred_end_date!).toLocaleDateString()
                  : 'N/A'
                const hodStatus = req.hod_review_status || req.hod_decision || 'pending'

                const isHrApproved = req.status?.toLowerCase() === 'hr_approved'
                // Only colour rows that are HR-approved and whose leave has ended
                const daysOver = getDaysOverdue(req.end_date || req.preferred_end_date || '')
                
                // Use inline styles for row coloring to ensure colors are applied
                let rowStyle: React.CSSProperties = {}
                if (isHrApproved && daysOver > 0) {
                  if (daysOver >= 5) {
                    rowStyle = { backgroundColor: '#fee2e2' } // red-100
                  } else {
                    rowStyle = { backgroundColor: '#fffbeb' } // amber-50
                  }
                }

                return (
                  <TableRow key={req.id} style={rowStyle}>
                    <TableCell className="font-medium">{staffName}</TableCell>
                    <TableCell>{deptName}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{req.leave_type || req.leave_type_key || 'Annual'}</Badge>
                    </TableCell>
                    <TableCell>{startDate}</TableCell>
                    <TableCell>{endDate}</TableCell>
                    <TableCell>{getStatusBadge(req.status)}</TableCell>
                    <TableCell>{getHodStatusBadge(hodStatus)}</TableCell>
                    <TableCell className="text-center">
                      {isHrApproved ? (
                        daysOver > 0 ? (
                          <Badge className={`border text-xs ${daysOver >= 5 ? 'bg-red-100 text-red-800 border-red-300' : 'bg-amber-100 text-amber-800 border-amber-300'}`}>
                            <XCircle className="h-3 w-3 mr-1" />
                            Awaiting
                          </Badge>
                        ) : (
                          <Badge className="bg-gray-100 text-gray-600 border border-gray-200 text-xs">—</Badge>
                        )
                      ) : (
                        <Badge className="bg-gray-100 text-gray-600 border border-gray-200 text-xs">—</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {isHrApproved ? (
                        daysOver > 0 ? (
                          <Badge className={`border text-xs ${daysOver >= 5 ? 'bg-red-100 text-red-800 border-red-300' : 'bg-amber-100 text-amber-800 border-amber-300'}`}>
                            <XCircle className="h-3 w-3 mr-1" />
                            Pending
                          </Badge>
                        ) : (
                          <Badge className="bg-gray-100 text-gray-600 border border-gray-200 text-xs">—</Badge>
                        )
                      ) : (
                        <Badge className="bg-gray-100 text-gray-600 border border-gray-200 text-xs">—</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      {isHrApproved && req.confirmation_status === 'pending_hod_rm' && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1 text-orange-600 border-orange-200 hover:bg-orange-50"
                          onClick={() => openConfirmationModal(req, 'pending_hod_rm')}
                        >
                          <AlertTriangle className="h-4 w-4" />
                          Verify Resumption
                        </Button>
                      )}
                      {isHrApproved && req.confirmation_status === 'pending_hr_manual' && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1 text-red-600 border-red-200 hover:bg-red-50"
                          onClick={() => openConfirmationModal(req, 'pending_hr_manual')}
                        >
                          <AlertCircle className="h-4 w-4" />
                          HR Verify
                        </Button>
                      )}
                      {isHrApproved && !req.confirmation_status?.includes('pending') && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1 text-teal-600 border-teal-200 hover:bg-teal-50"
                          onClick={() => downloadLeaveMemo(req.id, staffName)}
                          disabled={downloadingId === req.id}
                        >
                          {downloadingId === req.id ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Downloading...
                            </>
                          ) : (
                            <>
                              <Download className="h-4 w-4" />
                              Download
                            </>
                          )}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {filteredRequests.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground text-center">
            Showing {filteredRequests.length} of {requests.length} requests
          </p>
          <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
            <span className="font-medium">Row colour key:</span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-6 rounded bg-amber-100 border border-amber-300" />
              1-4 days since leave ended (amber)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-6 rounded bg-red-100 border border-red-300" />
              5+ days since leave ended — urgent (red)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-6 rounded bg-white border border-gray-200" />
              Confirmed or leave ongoing
            </span>
          </div>
        </div>
      )}

      {/* Resumption Confirmation Modal */}
      <Dialog open={confirmationModal.isOpen} onOpenChange={(open) => {
        if (!open) setConfirmationModal({ isOpen: false, request: null, confirmationStatus: null, notes: '', isSubmitting: false })
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {confirmationModal.confirmationStatus === 'pending_hod_rm' ? (
                <>
                  <AlertTriangle className="h-5 w-5 text-orange-600" />
                  HOD/RM Verification Required
                </>
              ) : (
                <>
                  <AlertCircle className="h-5 w-5 text-red-600" />
                  HR Manual Verification
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {confirmationModal.request && (
                <div className="space-y-2 mt-3">
                  <p className="font-medium text-slate-900">{confirmationModal.request.user_profiles?.first_name} {confirmationModal.request.user_profiles?.last_name}</p>
                  <p className="text-sm text-slate-600">
                    Leave ended: {new Date(confirmationModal.request.end_date || confirmationModal.request.preferred_end_date || '').toLocaleDateString()}
                  </p>
                  {confirmationModal.confirmationStatus === 'pending_hod_rm' && (
                    <p className="text-sm text-orange-700 bg-orange-50 p-2 rounded">
                      Please confirm if this staff member is physically present at their workstation.
                    </p>
                  )}
                  {confirmationModal.confirmationStatus === 'pending_hr_manual' && (
                    <p className="text-sm text-red-700 bg-red-50 p-2 rounded">
                      HOD/RM did not confirm within the required timeframe. Please manually verify resumption status.
                    </p>
                  )}
                </div>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Notes/Evidence</label>
              <Textarea
                placeholder="Add any supporting notes (e.g., 'Confirmed at desk', 'Not present', 'On site')"
                value={confirmationModal.notes}
                onChange={(e) => setConfirmationModal(prev => ({ ...prev, notes: e.target.value }))}
                className="text-sm"
              />
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => handleConfirmation('rejected')}
                disabled={confirmationModal.isSubmitting}
                className="flex-1 gap-2"
              >
                <XCircle className="h-4 w-4" />
                Not Resumed
              </Button>
              <Button
                onClick={() => handleConfirmation('confirmed')}
                disabled={confirmationModal.isSubmitting}
                className="flex-1 gap-2 bg-green-600 hover:bg-green-700"
              >
                {confirmationModal.isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Confirming...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    Confirmed
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
