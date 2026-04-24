'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AlertTriangle, MapPin, Clock, User, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { OffPremisesRequestModal } from './offpremises-request-modal'

interface PendingRequest {
  id: string
  user_id: string
  current_location_name: string
  latitude: number
  longitude: number
  accuracy: number
  device_info: string
  reason?: string | null
  created_at: string
  status: string
  approved_by_id?: string
  approved_at?: string
  rejection_reason?: string
  google_maps_name?: string
  user_profiles?: {
    id?: string
    first_name?: string
    last_name?: string
    email?: string
    employee_id?: string
    department_id?: string
    position?: string
    assigned_location_id?: string
  }
}

export function PendingOffPremisesRequests() {
  const [selectedRequest, setSelectedRequest] = useState<PendingRequest | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [allRequests, setAllRequests] = useState<PendingRequest[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [managerProfile, setManagerProfile] = useState<any>(null)
  const [activeTab, setActiveTab] = useState<string>('all')
  const [compactMode, setCompactMode] = useState(false)
  const [quickSelectedRequest, setQuickSelectedRequest] = useState<PendingRequest | null>(null)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const { toast } = useToast()
  const [quickEnabledOnDesktop, setQuickEnabledOnDesktop] = useState(false)

  // Always load ALL requests, then filter client-side for accurate tab counts
  const loadPendingRequests = async () => {
    try {
      setIsLoading(true)
      setError(null)

      // Always fetch all statuses - the API handles authentication and role checks
      const response = await fetch(`/api/attendance/offpremises/pending?status=all`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        if (response.status === 401) {
          setError('Unable to authenticate - please log in again')
        } else if (response.status === 403) {
          setError('You do not have permission to view off-premises requests')
        } else if (response.status === 404) {
          setError('User profile not found')
        } else {
          setError('Failed to fetch requests: ' + (errorData.error || response.statusText) + (errorData.details ? ' (' + errorData.details + ')' : ''))
        }
        return
      }

      const data = await response.json()
      console.log("[v0] Loaded requests:", data.requests)
      console.log("[v0] Total count:", data.count)
      console.log("[v0] Pending filter:", data.requests?.filter((r: any) => r.status === 'pending'))

      // Preserve selectedRequest during polling so the open review modal isn't closed
      // when the list refreshes. If the selected request still exists in the fresh
      // dataset, update it with the latest values; otherwise keep the existing
      // selectedRequest so the reviewer can finish their work.
      const fresh = data.requests || []
      setAllRequests(fresh)
      if (selectedRequest) {
        const updated = fresh.find((r: any) => r.id === selectedRequest.id)
        if (updated) {
          setSelectedRequest(updated)
        } else {
          // If the selected request was removed from the list (e.g., processed by
          // another approver), keep the modal open and leave the selectedRequest
          // as-is so the reviewer can still inspect it; do not automatically close.
          console.log('[v0] Selected request not found in fresh list; preserving current selection')
        }
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred while loading requests')
    } finally {
      setIsLoading(false)
    }
  }

  // Load all requests on mount, poll every 30 seconds
  useEffect(() => {
    loadPendingRequests()
    const interval = setInterval(loadPendingRequests, 30000)
    // Responsive compact mode for small screens / mobile reviewers
    const handleResize = () => setCompactMode(typeof window !== 'undefined' && window.innerWidth <= 768)
    handleResize()
    window.addEventListener('resize', handleResize)
    // load persisted desktop quick-actions preference
    try {
      const saved = typeof window !== 'undefined' ? window.localStorage.getItem('offpremises.quickActions') : null
      if (saved !== null) setQuickEnabledOnDesktop(saved === '1')
    } catch (e) {
      // ignore
    }
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Persist quick actions toggle
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('offpremises.quickActions', quickEnabledOnDesktop ? '1' : '0')
      }
    } catch (e) {
      // ignore
    }
  }, [quickEnabledOnDesktop])

  // Derive counts and filtered list from allRequests
  const pendingCount = allRequests.filter(r => r.status === 'pending').length
  const approvedCount = allRequests.filter(r => r.status === 'approved').length
  const rejectedCount = allRequests.filter(r => r.status === 'rejected').length
  const filteredRequests = activeTab === 'all' ? allRequests : allRequests.filter(r => r.status === activeTab)

  const handleTabChange = (value: string) => {
    setActiveTab(value)
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">Pending</Badge>
      case 'approved':
        return <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">Approved</Badge>
      case 'rejected':
        return <Badge variant="secondary" className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">Rejected</Badge>
      default:
        return <Badge variant="secondary">{status}</Badge>
    }
  }

  const handleRequestClick = (request: PendingRequest) => {
    // On mobile compact mode or when desktop quick actions enabled, select for quick actions; otherwise open full modal
    if (compactMode || quickEnabledOnDesktop) {
      setQuickSelectedRequest(request)
      // do not open modal by default on compact
      return
    }
    setSelectedRequest(request)
    setIsModalOpen(true)
  }

  const handleApprovalComplete = () => {
    setIsModalOpen(false)
    setSelectedRequest(null)
    loadPendingRequests()
  }

  // Quick approve/reject handlers used by mobile quick actions
  const quickProcess = async (request: PendingRequest, approved: boolean) => {
    if (processingId) return
    setProcessingId(request.id)
    try {
      const supabase = createClient()
      const { data: { user: currentUser } } = await supabase.auth.getUser()

      const response = await fetch('/api/attendance/offpremises/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id: request.id, approved, comments: '', user_id: currentUser?.id }),
      })


      const result = await response.json().catch(() => ({}))
      if (!response.ok) {
        const message = result.error || 'Failed to process request'
        if (String(message).toLowerCase().includes('already been processed')) {
          toast({ title: 'Already processed', description: 'This request was already handled.' })
          loadPendingRequests()
          setQuickSelectedRequest(null)
          return
        }
        throw new Error(message)
      }

      // Capture attendance record id if the approval created one so we can offer Undo
      const attendanceId = result.attendance_record_id || null

      toast({
        title: approved ? 'Approved' : 'Rejected',
          description: approved
            ? `${request.user_profiles?.first_name || 'Unknown'} ${request.user_profiles?.last_name || ''} checked in (off-premises).`
          : `Off-premises request rejected.`,
        action: attendanceId ? (
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              try {
                setProcessingId(request.id)
                const sup = createClient()
                const { data: { user: currentUser2 } } = await sup.auth.getUser()
                await fetch('/api/attendance/offpremises/revert', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ request_id: request.id, user_id: currentUser2?.id, attendance_record_id: attendanceId }),
                })
                toast({ title: 'Reverted', description: 'Approval reverted' })
                loadPendingRequests()
                setQuickSelectedRequest(null)
              } catch (err: any) {
                toast({ title: 'Undo Failed', description: err?.message || 'Failed to undo approval', variant: 'destructive' })
              } finally {
                setProcessingId(null)
              }
            }}
          >
            Undo
          </Button>
        ) : undefined,
      })

      // Refresh list and clear quick selection
      loadPendingRequests()
      setQuickSelectedRequest(null)
    } catch (err: any) {
      toast({ title: 'Error', description: err?.message || 'Failed to process request', variant: 'destructive' })
    } finally {
      setProcessingId(null)
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Pending Off-Premises Check-In Requests</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
          <span className="ml-2">Loading requests...</span>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    // Check if error is due to missing table
    const isMissingTable = error.includes("Could not find the table 'public.pending_offpremises_checkins'") || 
                           error.includes("pending_offpremises_checkins")
    
    return (
      <Card>
        <CardHeader>
          <CardTitle>Pending Off-Premises Check-In Requests</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Error Loading Requests</AlertTitle>
            <AlertDescription>
              {isMissingTable ? (
                <div>
                  <p>The database table for off-premises requests needs to be created.</p>
                  <p className="mt-2 text-sm">Please run this SQL in your Supabase SQL Editor:</p>
                  <pre className="mt-2 p-2 bg-gray-900 text-gray-100 text-xs overflow-auto rounded">
{`CREATE TABLE IF NOT EXISTS public.pending_offpremises_checkins (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  current_location_name TEXT NOT NULL,
  latitude FLOAT8 NOT NULL,
  longitude FLOAT8 NOT NULL,
  accuracy FLOAT8,
  device_info TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  approved_by_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pending_offpremises_user_id ON public.pending_offpremises_checkins(user_id);
CREATE INDEX IF NOT EXISTS idx_pending_offpremises_status ON public.pending_offpremises_checkins(status);
CREATE INDEX IF NOT EXISTS idx_pending_offpremises_created_at ON public.pending_offpremises_checkins(created_at DESC);`}
                  </pre>
                  <p className="mt-2 text-sm">After creating the table, click Retry below.</p>
                </div>
              ) : (
                error
              )}
            </AlertDescription>
          </Alert>
          <Button onClick={loadPendingRequests} className="mt-4">
            Retry
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Off-Premises Check-In Requests</CardTitle>
              <CardDescription>
                Review and manage staff requests for off-premises check-ins
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-sm">
                {allRequests.length} Total
              </Badge>
              <label className="ml-2 flex items-center text-sm select-none">
                <input
                  type="checkbox"
                  className="mr-2 rounded"
                  checked={quickEnabledOnDesktop}
                  onChange={(e) => setQuickEnabledOnDesktop(e.target.checked)}
                />
                Quick actions on desktop
              </label>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
            <TabsList className={compactMode ? 'flex gap-2 overflow-x-auto mb-4' : 'grid w-full grid-cols-4 mb-4'}>
              <TabsTrigger value="all" className={compactMode ? 'whitespace-nowrap px-3 py-2 text-sm' : ''}>
                All ({allRequests.length})
              </TabsTrigger>
              <TabsTrigger value="pending" className={compactMode ? 'whitespace-nowrap px-3 py-2 text-sm' : ''}>
                Pending ({pendingCount})
              </TabsTrigger>
              <TabsTrigger value="approved" className={compactMode ? 'whitespace-nowrap px-3 py-2 text-sm' : ''}>
                Approved ({approvedCount})
              </TabsTrigger>
              <TabsTrigger value="rejected" className={compactMode ? 'whitespace-nowrap px-3 py-2 text-sm' : ''}>
                Rejected ({rejectedCount})
              </TabsTrigger>
            </TabsList>

            {filteredRequests.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle2 className="mx-auto h-12 w-12 mb-3 text-green-600" />
                <p>No {activeTab === 'all' ? '' : activeTab} requests found.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredRequests.map((request) => (
                  <div
                    key={request.id}
                    className={"border rounded-lg transition-colors cursor-pointer " + (compactMode ? 'p-3 hover:bg-muted/40' : 'p-4 hover:bg-muted/50')}
                    onClick={() => handleRequestClick(request)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-lg">
                              {request.user_profiles?.first_name} {request.user_profiles?.last_name}
                            </h3>
                            {request.request_type && (
                              <Badge className="text-xs ml-1">{request.request_type === 'checkout' ? 'Checkout' : 'Check‑in'}</Badge>
                            )}
                            {getStatusBadge(request.status)}
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-muted-foreground">
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4" />
                            <span>{request.user_profiles?.email}</span>
                          </div>
                          {request.user_profiles?.employee_id && (
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4" />
                              <span>ID: {request.user_profiles?.employee_id}</span>
                            </div>
                          )}
                          {request.user_profiles?.position && (
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4" />
                              <span>Position: {request.user_profiles?.position}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4" />
                            <span>Requested: {formatDate(request.created_at)}</span>
                          </div>
                          {request.approved_at && (
                            <div className="flex items-center gap-2">
                              <CheckCircle2 className="h-4 w-4" />
                              <span>{request.status === 'approved' ? 'Approved' : 'Reviewed'}: {formatDate(request.approved_at)}</span>
                            </div>
                          )}
                          <div className="flex items-start gap-2 md:col-span-2">
                            <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
                            <div className="flex-1">
                              <p className="font-medium text-foreground">{request.google_maps_name || request.current_location_name}</p>
                              <p className="text-xs">
                                {request.latitude.toFixed(4)}, {request.longitude.toFixed(4)} (accuracy: {Math.round(request.accuracy)}m)
                              </p>
                              {request.reason && (
                                <p className="text-sm mt-2 text-muted-foreground"><strong>Reason:</strong> {request.reason}</p>
                              )}
                            </div>
                          </div>
                          {request.rejection_reason && (
                            <div className="flex items-start gap-2 md:col-span-2">
                              <XCircle className="h-4 w-4 mt-0.5 flex-shrink-0 text-destructive" />
                              <p className="text-destructive">Reason: {request.rejection_reason}</p>
                            </div>
                          )}
                        </div>
                      </div>
                      
                      {request.status === 'pending' && (
                        // On compact (mobile) show quick action buttons and a review button on larger screens
                        compactMode ? (
                          <div className="mt-3 grid grid-cols-2 gap-2">
                            <Button
                              variant="ghost"
                              className="w-full"
                              onClick={(e) => {
                                e.stopPropagation()
                                quickProcess(request, true)
                              }}
                              disabled={processingId === request.id}
                            >
                              Approve
                            </Button>
                            <Button
                              variant="destructive"
                              className="w-full"
                              onClick={(e) => {
                                e.stopPropagation()
                                quickProcess(request, false)
                              }}
                              disabled={processingId === request.id}
                            >
                              Reject
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="ml-4 flex-shrink-0"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleRequestClick(request)
                              }}
                            >
                              Review
                            </Button>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Tabs>
        </CardContent>
      </Card>

      {selectedRequest && (
        <OffPremisesRequestModal
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false)
            setSelectedRequest(null)
          }}
          request={selectedRequest}
          onApprovalComplete={handleApprovalComplete}
        />
      )}

      {/* Sticky quick action bar for mobile when a request is selected */}
      {compactMode && quickSelectedRequest && (
        <div className="fixed bottom-0 left-0 right-0 bg-background border-t p-3 safe-area-inset-x">
          <div className="max-w-4xl mx-auto flex items-center gap-3">
            <div className="flex-1">
              <div className="text-sm font-medium">{quickSelectedRequest.user_profiles?.first_name || 'Unknown'} {quickSelectedRequest.user_profiles?.last_name || ''}</div>
              <div className="text-xs text-muted-foreground">{quickSelectedRequest.google_maps_name || quickSelectedRequest.current_location_name}</div>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" className="px-4" onClick={() => quickProcess(quickSelectedRequest, false)} disabled={processingId === quickSelectedRequest.id}>Reject</Button>
              <Button className="px-4 bg-green-600 hover:bg-green-700" onClick={() => quickProcess(quickSelectedRequest, true)} disabled={processingId === quickSelectedRequest.id}>Approve</Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
