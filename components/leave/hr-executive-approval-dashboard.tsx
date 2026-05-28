'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  Calendar,
  User,
  CalendarClock,
  RotateCcw,
  ChevronDown,
  FileText,
  Building2
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { format } from 'date-fns'

interface StaffProfile {
  id: string
  first_name: string
  last_name: string
  employee_id: string
  position: string
  department_id: string
  departments?: { name: string }
}

interface DefermentRequest {
  id: string
  user_id: string
  user_profiles?: StaffProfile
  initiator?: {
    id: string
    first_name: string
    last_name: string
    employee_id: string
    position: string
  }
  reason: string
  requested_deferment_year?: number
  requested_deferment_period?: string
  status: string
  hr_executive_decision: string
  created_at: string
  updated_at: string
  leave_plan_requests?: {
    id: string
    leave_type_key: string
    preferred_start_date: string
    preferred_end_date: string
    adjusted_start_date?: string
    adjusted_end_date?: string
    requested_days?: number
    adjusted_days?: number
  }
}

interface RecallRequest {
  id: string
  staff_user_id: string
  user_profiles?: StaffProfile
  initiator?: {
    id: string
    first_name: string
    last_name: string
    employee_id: string
    position: string
  }
  recall_reason: string
  recall_date: string
  status: string
  hr_executive_decision: string
  created_at: string
  updated_at: string
  leave_plan_requests?: {
    id: string
    leave_type_key: string
    preferred_start_date: string
    preferred_end_date: string
    adjusted_start_date?: string
    adjusted_end_date?: string
  }
}

interface HRExecutiveApprovalDashboardProps {
  hrExecutiveId: string
  userRole: string
}

const getStatusBadge = (status: string) => {
  switch (status) {
    case 'approved':
      return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100"><CheckCircle className="h-3 w-3 mr-1" />Approved</Badge>
    case 'rejected':
      return <Badge className="bg-red-100 text-red-700 hover:bg-red-100"><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>
    case 'pending':
      return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100"><Clock className="h-3 w-3 mr-1" />Pending</Badge>
    default:
      return <Badge className="bg-slate-100 text-slate-700">{status?.replace(/_/g, ' ')}</Badge>
  }
}

const formatLeaveType = (key: string | undefined) => {
  if (!key) return 'N/A'
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export function HRExecutiveApprovalDashboard({ hrExecutiveId, userRole }: HRExecutiveApprovalDashboardProps) {
  const { toast } = useToast()
  const [deferments, setDeferments] = useState<DefermentRequest[]>([])
  const [recalls, setRecalls] = useState<RecallRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'pending' | 'processed'>('pending')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  
  // Decision dialog state
  const [decisionDialog, setDecisionDialog] = useState<{
    open: boolean
    type: 'deferment' | 'recall'
    requestId: string
    decision: 'approved' | 'rejected'
    staffName: string
  } | null>(null)
  const [rejectionReason, setRejectionReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const fetchRequests = async () => {
    try {
      setLoading(true)
      const status = activeTab === 'pending' ? 'pending' : 'all'
      const res = await fetch(
        `/api/leave/deferment-recall/hr-executive-requests?hr_executive_id=${hrExecutiveId}&user_role=${encodeURIComponent(userRole)}&status=${status}&type=all`
      )
      
      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.error || 'Failed to fetch requests')
      }

      const data = await res.json()
      
      if (activeTab === 'pending') {
        setDeferments(data.deferments?.filter((d: DefermentRequest) => d.hr_executive_decision === 'pending') || [])
        setRecalls(data.recalls?.filter((r: RecallRequest) => r.hr_executive_decision === 'pending') || [])
      } else {
        setDeferments(data.deferments?.filter((d: DefermentRequest) => d.hr_executive_decision !== 'pending') || [])
        setRecalls(data.recalls?.filter((r: RecallRequest) => r.hr_executive_decision !== 'pending') || [])
      }
    } catch (error) {
      console.error('[v0] Error fetching HR executive requests:', error)
      toast({ 
        title: 'Error', 
        description: error instanceof Error ? error.message : 'Failed to fetch requests', 
        variant: 'destructive' 
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (hrExecutiveId) {
      fetchRequests()
    }
  }, [hrExecutiveId, activeTab])

  const openDecisionDialog = (
    type: 'deferment' | 'recall',
    requestId: string,
    decision: 'approved' | 'rejected',
    staffName: string
  ) => {
    setDecisionDialog({ open: true, type, requestId, decision, staffName })
    setRejectionReason('')
  }

  const handleDecision = async () => {
    if (!decisionDialog) return

    if (decisionDialog.decision === 'rejected' && !rejectionReason.trim()) {
      toast({ title: 'Error', description: 'Please provide a reason for rejection', variant: 'destructive' })
      return
    }

    try {
      setSubmitting(true)
      const res = await fetch('/api/leave/deferment-recall/hr-executive-decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request_id: decisionDialog.requestId,
          request_type: decisionDialog.type,
          decision: decisionDialog.decision,
          rejection_reason: decisionDialog.decision === 'rejected' ? rejectionReason : undefined,
          hr_executive_id: hrExecutiveId,
          hr_executive_role: userRole
        })
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to process decision')

      toast({ 
        title: 'Success', 
        description: data.message || `Request ${decisionDialog.decision} successfully`
      })
      
      setDecisionDialog(null)
      fetchRequests()
    } catch (error) {
      console.error('[v0] Decision error:', error)
      toast({ 
        title: 'Error', 
        description: error instanceof Error ? error.message : 'Failed to process decision', 
        variant: 'destructive' 
      })
    } finally {
      setSubmitting(false)
    }
  }

  const renderDefermentCard = (req: DefermentRequest) => {
    const isExpanded = expandedId === `deferment-${req.id}`
    const staffName = req.user_profiles 
      ? `${req.user_profiles.first_name} ${req.user_profiles.last_name}`
      : 'Unknown Staff'
    const initiatorName = req.initiator
      ? `${req.initiator.first_name} ${req.initiator.last_name}`
      : 'Unknown'
    const department = req.user_profiles?.departments?.name || 'N/A'
    const leaveType = formatLeaveType(req.leave_plan_requests?.leave_type_key)
    const deferYear = req.requested_deferment_period || `${req.requested_deferment_year}` || 'N/A'
    const startDate = req.leave_plan_requests?.adjusted_start_date || req.leave_plan_requests?.preferred_start_date
    const endDate = req.leave_plan_requests?.adjusted_end_date || req.leave_plan_requests?.preferred_end_date
    const leaveDays = req.leave_plan_requests?.adjusted_days || req.leave_plan_requests?.requested_days || 0

    return (
      <div key={req.id} className="border border-amber-200 rounded-lg bg-gradient-to-br from-amber-50 to-yellow-50/50 overflow-hidden">
        <div className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <CalendarClock className="h-4 w-4 text-amber-600" />
                <h4 className="font-semibold text-slate-800">{staffName}</h4>
                <Badge variant="outline" className="text-xs bg-amber-100 text-amber-700 border-amber-200">
                  Deferment
                </Badge>
                {getStatusBadge(req.hr_executive_decision)}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 text-xs">
                <div>
                  <p className="text-slate-500">Department</p>
                  <p className="font-medium text-slate-700">{department}</p>
                </div>
                <div>
                  <p className="text-slate-500">Leave Type</p>
                  <p className="font-medium text-slate-700">{leaveType}</p>
                </div>
                <div>
                  <p className="text-slate-500">Defer To</p>
                  <p className="font-medium text-slate-700">{deferYear}</p>
                </div>
                <div>
                  <p className="text-slate-500">Requested By</p>
                  <p className="font-medium text-slate-700">{initiatorName}</p>
                </div>
              </div>
            </div>
            <button
              onClick={() => setExpandedId(isExpanded ? null : `deferment-${req.id}`)}
              className="p-2 hover:bg-amber-100 rounded-lg transition-colors"
            >
              <ChevronDown className={`h-5 w-5 text-amber-600 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
            </button>
          </div>
        </div>
        
        {isExpanded && (
          <div className="border-t border-amber-200 p-4 bg-white space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-semibold text-slate-600 mb-1">ORIGINAL LEAVE PERIOD</p>
                <div className="bg-slate-50 rounded p-3">
                  <p className="text-sm text-slate-700">
                    {startDate ? format(new Date(startDate), 'dd MMM yyyy') : 'Not set'} - {endDate ? format(new Date(endDate), 'dd MMM yyyy') : 'Not set'}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">{leaveDays} days</p>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-600 mb-1">STAFF DETAILS</p>
                <div className="bg-slate-50 rounded p-3">
                  <p className="text-sm text-slate-700">{req.user_profiles?.employee_id || 'N/A'}</p>
                  <p className="text-xs text-slate-500 mt-1">{req.user_profiles?.position || 'N/A'}</p>
                </div>
              </div>
            </div>
            
            <div>
              <p className="text-xs font-semibold text-slate-600 mb-2">REASON FOR DEFERMENT</p>
              <div className="bg-amber-50 border border-amber-200 rounded p-3">
                <p className="text-sm text-slate-700">{req.reason || 'No reason provided'}</p>
              </div>
            </div>

            {/* Action buttons for pending requests */}
            {req.hr_executive_decision === 'pending' && (
              <div className="flex gap-3 pt-2 border-t border-slate-100">
                <Button 
                  onClick={() => openDecisionDialog('deferment', req.id, 'approved', staffName)}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Approve Deferment
                </Button>
                <Button 
                  onClick={() => openDecisionDialog('deferment', req.id, 'rejected', staffName)}
                  variant="outline"
                  className="flex-1 border-red-200 text-red-600 hover:bg-red-50"
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Reject
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  const renderRecallCard = (req: RecallRequest) => {
    const isExpanded = expandedId === `recall-${req.id}`
    const staffName = req.user_profiles 
      ? `${req.user_profiles.first_name} ${req.user_profiles.last_name}`
      : 'Unknown Staff'
    const initiatorName = req.initiator
      ? `${req.initiator.first_name} ${req.initiator.last_name}`
      : 'Unknown'
    const department = req.user_profiles?.departments?.name || 'N/A'
    const leaveType = formatLeaveType(req.leave_plan_requests?.leave_type_key)
    const startDate = req.leave_plan_requests?.adjusted_start_date || req.leave_plan_requests?.preferred_start_date
    const endDate = req.leave_plan_requests?.adjusted_end_date || req.leave_plan_requests?.preferred_end_date

    return (
      <div key={req.id} className="border border-rose-200 rounded-lg bg-gradient-to-br from-rose-50 to-red-50/50 overflow-hidden">
        <div className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <RotateCcw className="h-4 w-4 text-rose-600" />
                <h4 className="font-semibold text-slate-800">{staffName}</h4>
                <Badge variant="outline" className="text-xs bg-rose-100 text-rose-700 border-rose-200">
                  Recall
                </Badge>
                {getStatusBadge(req.hr_executive_decision)}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 text-xs">
                <div>
                  <p className="text-slate-500">Department</p>
                  <p className="font-medium text-slate-700">{department}</p>
                </div>
                <div>
                  <p className="text-slate-500">Leave Type</p>
                  <p className="font-medium text-slate-700">{leaveType}</p>
                </div>
                <div>
                  <p className="text-slate-500">Recall Date</p>
                  <p className="font-medium text-slate-700">{req.recall_date ? format(new Date(req.recall_date), 'dd MMM yyyy') : 'N/A'}</p>
                </div>
                <div>
                  <p className="text-slate-500">Requested By</p>
                  <p className="font-medium text-slate-700">{initiatorName}</p>
                </div>
              </div>
            </div>
            <button
              onClick={() => setExpandedId(isExpanded ? null : `recall-${req.id}`)}
              className="p-2 hover:bg-rose-100 rounded-lg transition-colors"
            >
              <ChevronDown className={`h-5 w-5 text-rose-600 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
            </button>
          </div>
        </div>
        
        {isExpanded && (
          <div className="border-t border-rose-200 p-4 bg-white space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-semibold text-slate-600 mb-1">ORIGINAL LEAVE PERIOD</p>
                <div className="bg-slate-50 rounded p-3">
                  <p className="text-sm text-slate-700">
                    {startDate ? format(new Date(startDate), 'dd MMM yyyy') : 'Not set'} - {endDate ? format(new Date(endDate), 'dd MMM yyyy') : 'Not set'}
                  </p>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-600 mb-1">STAFF DETAILS</p>
                <div className="bg-slate-50 rounded p-3">
                  <p className="text-sm text-slate-700">{req.user_profiles?.employee_id || 'N/A'}</p>
                  <p className="text-xs text-slate-500 mt-1">{req.user_profiles?.position || 'N/A'}</p>
                </div>
              </div>
            </div>
            
            <div>
              <p className="text-xs font-semibold text-slate-600 mb-2">REASON FOR RECALL</p>
              <div className="bg-rose-50 border border-rose-200 rounded p-3">
                <p className="text-sm text-slate-700">{req.recall_reason || 'No reason provided'}</p>
              </div>
            </div>

            {/* Action buttons for pending requests */}
            {req.hr_executive_decision === 'pending' && (
              <div className="flex gap-3 pt-2 border-t border-slate-100">
                <Button 
                  onClick={() => openDecisionDialog('recall', req.id, 'approved', staffName)}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Approve Recall
                </Button>
                <Button 
                  onClick={() => openDecisionDialog('recall', req.id, 'rejected', staffName)}
                  variant="outline"
                  className="flex-1 border-red-200 text-red-600 hover:bg-red-50"
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Reject
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  const pendingCount = deferments.length + recalls.length

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="border-b border-slate-100 bg-gradient-to-r from-purple-600 to-violet-600 text-white rounded-t-lg">
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Deferment &amp; Recall Approvals
        </CardTitle>
        <CardDescription className="text-purple-100">
          Review and process deferment and recall requests assigned to you
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-6">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'pending' | 'processed')}>
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="pending" className="relative">
              Pending Review
              {activeTab !== 'pending' && pendingCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                  {pendingCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="processed">Processed</TabsTrigger>
          </TabsList>

          <TabsContent value="pending">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
              </div>
            ) : deferments.length === 0 && recalls.length === 0 ? (
              <Alert className="border-purple-200 bg-purple-50">
                <AlertCircle className="h-4 w-4 text-purple-600" />
                <AlertDescription className="text-purple-700">
                  No pending requests assigned to you for review.
                </AlertDescription>
              </Alert>
            ) : (
              <div className="space-y-4">
                {deferments.map(renderDefermentCard)}
                {recalls.map(renderRecallCard)}
              </div>
            )}
          </TabsContent>

          <TabsContent value="processed">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
              </div>
            ) : deferments.length === 0 && recalls.length === 0 ? (
              <Alert className="border-slate-200 bg-slate-50">
                <AlertCircle className="h-4 w-4 text-slate-600" />
                <AlertDescription className="text-slate-700">
                  No processed requests found.
                </AlertDescription>
              </Alert>
            ) : (
              <div className="space-y-4">
                {deferments.map(renderDefermentCard)}
                {recalls.map(renderRecallCard)}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>

      {/* Decision Confirmation Dialog */}
      <Dialog open={!!decisionDialog?.open} onOpenChange={(open) => !open && setDecisionDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {decisionDialog?.decision === 'approved' ? 'Approve' : 'Reject'} {decisionDialog?.type === 'deferment' ? 'Deferment' : 'Recall'} Request
            </DialogTitle>
            <DialogDescription>
              {decisionDialog?.decision === 'approved' 
                ? `You are about to approve the ${decisionDialog.type} request for ${decisionDialog?.staffName}.`
                : `Please provide a reason for rejecting this ${decisionDialog?.type} request for ${decisionDialog?.staffName}.`
              }
            </DialogDescription>
          </DialogHeader>

          {decisionDialog?.decision === 'rejected' && (
            <div className="space-y-2">
              <Label htmlFor="rejection-reason">Rejection Reason *</Label>
              <Textarea
                id="rejection-reason"
                placeholder="Enter reason for rejection..."
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                rows={3}
              />
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDecisionDialog(null)} disabled={submitting}>
              Cancel
            </Button>
            <Button 
              onClick={handleDecision}
              disabled={submitting}
              className={decisionDialog?.decision === 'approved' 
                ? 'bg-emerald-600 hover:bg-emerald-700' 
                : 'bg-red-600 hover:bg-red-700'
              }
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : decisionDialog?.decision === 'approved' ? (
                'Confirm Approval'
              ) : (
                'Confirm Rejection'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
