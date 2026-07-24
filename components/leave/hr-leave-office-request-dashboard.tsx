'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Loader2,
  Search,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  Clock,
  Briefcase,
  Users,
  Send,
  X,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { format } from 'date-fns'

interface RequestData {
  id: string
  staff_user_id: string
  request_reason?: string
  deferment_to_year?: string
  recall_reason?: string
  created_at: string
  hod_approval_status: string
  assigned_hr_executive_id?: string | null
  staff?: {
    id: string
    first_name: string
    last_name: string
    employee_id: string
    position: string
  }
  department?: {
    id: string
    name: string
  }
  leave?: {
    id: string
    leave_type: string
    balance_period_start: string
    balance_period_end: string
  }
}

interface HRExecutive {
  id: string
  name: string
  email: string
  position: string
  department: string | null
}

export function HRLeaveOfficeRequestDashboard() {
  const { toast } = useToast()
  const [defermentRequests, setDefermentRequests] = useState<RequestData[]>([])
  const [recallRequests, setRecallRequests] = useState<RequestData[]>([])
  const [hrExecutives, setHrExecutives] = useState<HRExecutive[]>([])
  const [loading, setLoading] = useState(true)
  const [assigning, setAssigning] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [requestTypeFilter, setRequestTypeFilter] = useState<'all' | 'deferment' | 'recall'>('all')

  // Assignment modal state
  const [assignModalOpen, setAssignModalOpen] = useState(false)
  const [selectedRequest, setSelectedRequest] = useState<{ data: RequestData; type: 'deferment' | 'recall' } | null>(null)
  const [selectedExecutive, setSelectedExecutive] = useState('')
  const [assignmentNotes, setAssignmentNotes] = useState('')

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      // Fetch pending deferment and recall requests — route checks authenticated user is hr_leave_office role
      const requestsRes = await fetch('/api/leave/deferment-recall/pending-requests')
      if (!requestsRes.ok) {
        const errData = await requestsRes.json().catch(() => ({}))
        throw new Error(errData.error || `Failed to fetch requests (${requestsRes.status})`)
      }
      const requestsData = await requestsRes.json()
      // Route returns { defermentRequests: [], recallRequests: [], total: 0 }
      setDefermentRequests(requestsData.defermentRequests || [])
      setRecallRequests(requestsData.recallRequests || [])

      // Fetch HR executives — query across all HR executive role variants using multi-role support
      const execRes = await fetch('/api/admin/users/by-role?roles=hr_executive,manager_hr,director_hr')
      if (execRes.ok) {
        const execData = await execRes.json()
        const executives = (execData.data || execData.users || []).map((user: any) => ({
          id: user.id,
          name: `${user.first_name || ''} ${user.last_name || ''}`.trim(),
          email: user.email,
          position: user.position || 'HR Executive',
          department: user.department,
        }))
        setHrExecutives(executives)
      } else {
        console.warn('[v0] Failed to fetch HR executives, using empty list')
        setHrExecutives([])
      }
    } catch (error: any) {
      console.error('[v0] Error fetching data:', error)
      toast({
        title: 'Error',
        description: error.message || 'Failed to load requests. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleAssignClick = (request: RequestData, type: 'deferment' | 'recall') => {
    setSelectedRequest({ data: request, type })
    setSelectedExecutive('')
    setAssignmentNotes('')
    setAssignModalOpen(true)
  }

  const handleAssignSubmit = async () => {
    if (!selectedRequest || !selectedExecutive) {
      toast({
        title: 'Error',
        description: 'Please select an HR executive',
        variant: 'destructive',
      })
      return
    }

    setAssigning(true)
    try {
      const response = await fetch('/api/leave/deferment-recall/assign-to-executive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: selectedRequest.type,
          requestId: selectedRequest.data.id,
          hrExecutiveId: selectedExecutive,
          notes: assignmentNotes || null,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to assign request')
      }

      toast({
        title: 'Success',
        description: 'Request assigned to HR executive successfully',
      })

      setAssignModalOpen(false)
      fetchData()
    } catch (error) {
      console.error('[v0] Assignment error:', error)
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to assign request',
        variant: 'destructive',
      })
    } finally {
      setAssigning(false)
    }
  }

  const allRequests = [...defermentRequests.map(r => ({ ...r, type: 'deferment' as const })), ...recallRequests.map(r => ({ ...r, type: 'recall' as const }))]

  const filteredRequests = allRequests.filter(req => {
    const matchesSearch =
      !searchTerm ||
      req.staff?.first_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      req.staff?.last_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      req.staff?.employee_id?.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesType = requestTypeFilter === 'all' || req.type === requestTypeFilter

    return matchesSearch && matchesType
  })

  const RequestCard = ({ request, type }: { request: RequestData; type: 'deferment' | 'recall' }) => (
    <Card className="border-0 shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="pt-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <Briefcase className={`h-4 w-4 ${type === 'deferment' ? 'text-amber-600' : 'text-rose-600'}`} />
              <h3 className="font-semibold text-slate-800 truncate">
                {request.staff?.first_name} {request.staff?.last_name}
              </h3>
              <Badge variant="outline" className={type === 'deferment' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-rose-50 text-rose-700 border-rose-200'}>
                {type === 'deferment' ? 'Deferment' : 'Recall'}
              </Badge>
            </div>

            <p className="text-xs text-slate-500 mb-3">
              {request.staff?.employee_id} • {request.department?.name}
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs mb-3">
              <div>
                <p className="text-slate-500">Position</p>
                <p className="font-medium text-slate-700 truncate">{request.staff?.position}</p>
              </div>
              <div>
                <p className="text-slate-500">Leave Type</p>
                <p className="font-medium text-slate-700">{request.leave?.leave_type || 'Annual'}</p>
              </div>
              <div>
                <p className="text-slate-500">Period</p>
                <p className="font-medium text-slate-700 text-xs">
                  {request.leave?.balance_period_start ? format(new Date(request.leave.balance_period_start), 'MMM yy') : 'N/A'}
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 line-clamp-2 italic">
              {type === 'deferment' ? request.request_reason : request.recall_reason}
            </p>
          </div>

          <div className="flex-shrink-0">
            <Button
              size="sm"
              className="gap-2 bg-blue-600 hover:bg-blue-700 text-white whitespace-nowrap"
              onClick={() => handleAssignClick(request, type)}
            >
              <Send className="h-4 w-4" />
              <span className="hidden sm:inline">Assign</span>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-slate-900">Process Requests</h1>
        <p className="text-slate-600">Review and assign pending deferment and recall requests to HR executives</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-0 shadow-sm bg-gradient-to-br from-blue-50 to-blue-100">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600">Total Pending</p>
                <p className="text-2xl font-bold text-slate-900">{filteredRequests.length}</p>
              </div>
              <Clock className="h-8 w-8 text-blue-600 opacity-20" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm bg-gradient-to-br from-amber-50 to-amber-100">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600">Deferments</p>
                <p className="text-2xl font-bold text-slate-900">{defermentRequests.length}</p>
              </div>
              <Briefcase className="h-8 w-8 text-amber-600 opacity-20" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm bg-gradient-to-br from-rose-50 to-rose-100">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600">Recalls</p>
                <p className="text-2xl font-bold text-slate-900">{recallRequests.length}</p>
              </div>
              <Users className="h-8 w-8 text-rose-600 opacity-20" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Help */}
      <Alert className="border-blue-200 bg-blue-50">
        <AlertCircle className="h-4 w-4 text-blue-600" />
        <AlertDescription className="text-blue-700">
          <strong>Workflow:</strong> Click the &quot;Assign&quot; button on any request below, select an HR executive, and click submit. The request will then appear in their Memo Management dashboard for approval.
        </AlertDescription>
      </Alert>

      {/* Filters */}
      <Card className="border-0 shadow-sm">
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium text-slate-700 mb-2 block">Search Staff</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Name, ID, Department..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 bg-slate-50"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700 mb-2 block">Request Type</label>
              <Select value={requestTypeFilter} onValueChange={(value: any) => setRequestTypeFilter(value)}>
                <SelectTrigger className="bg-slate-50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Requests</SelectItem>
                  <SelectItem value="deferment">Deferments Only</SelectItem>
                  <SelectItem value="recall">Recalls Only</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end">
              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={() => {
                  setSearchTerm('')
                  setRequestTypeFilter('all')
                }}
              >
                Reset Filters
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Requests List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      ) : filteredRequests.length === 0 ? (
        <Alert className="border-blue-200 bg-blue-50">
          <CheckCircle2 className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-blue-700">
            {defermentRequests.length + recallRequests.length === 0
              ? 'No pending requests. All deferments and recalls have been assigned!'
              : 'No requests match your search filters.'}
          </AlertDescription>
        </Alert>
      ) : (
        <div className="space-y-4">
          {defermentRequests.filter(req =>
            !searchTerm ||
            req.staff?.first_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            req.staff?.last_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            req.staff?.employee_id?.toLowerCase().includes(searchTerm.toLowerCase())
          ).length > 0 && requestTypeFilter !== 'recall' && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                <div className="w-1 h-6 bg-amber-600 rounded-full" />
                Pending Deferments
              </h2>
              <div className="space-y-2">
                {defermentRequests
                  .filter(req =>
                    !searchTerm ||
                    req.staff?.first_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    req.staff?.last_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    req.staff?.employee_id?.toLowerCase().includes(searchTerm.toLowerCase())
                  )
                  .map(request => (
                    <RequestCard key={request.id} request={request} type="deferment" />
                  ))}
              </div>
            </div>
          )}

          {recallRequests.filter(req =>
            !searchTerm ||
            req.staff?.first_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            req.staff?.last_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            req.staff?.employee_id?.toLowerCase().includes(searchTerm.toLowerCase())
          ).length > 0 && requestTypeFilter !== 'deferment' && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                <div className="w-1 h-6 bg-rose-600 rounded-full" />
                Pending Recalls
              </h2>
              <div className="space-y-2">
                {recallRequests
                  .filter(req =>
                    !searchTerm ||
                    req.staff?.first_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    req.staff?.last_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    req.staff?.employee_id?.toLowerCase().includes(searchTerm.toLowerCase())
                  )
                  .map(request => (
                    <RequestCard key={request.id} request={request} type="recall" />
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Assignment Modal */}
      <Dialog open={assignModalOpen} onOpenChange={setAssignModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5 text-blue-600" />
              Assign to HR Executive
            </DialogTitle>
            <DialogDescription>
              Select an HR executive to review and approve this {selectedRequest?.type} request
            </DialogDescription>
          </DialogHeader>

          {selectedRequest && (
            <div className="space-y-4">
              {/* Request Summary */}
              <div className="bg-slate-50 p-4 rounded-lg space-y-2 text-sm">
                <div className="font-semibold text-slate-900">
                  {selectedRequest.data.staff?.first_name} {selectedRequest.data.staff?.last_name}
                </div>
                <div className="text-slate-600">
                  {selectedRequest.data.staff?.employee_id} • {selectedRequest.data.department?.name}
                </div>
                <div className="text-slate-600">
                  {selectedRequest.type === 'deferment' ? 'Deferment' : 'Recall'} •{' '}
                  {selectedRequest.data.leave?.leave_type || 'Annual'} Leave
                </div>
              </div>

              {/* Executive Selector */}
              <div>
                <label className="text-sm font-medium text-slate-700 mb-2 block">Select HR Executive *</label>
                {hrExecutives.length === 0 ? (
                  <p className="text-sm text-slate-500 italic py-2">
                    No HR executives found. Ensure users with roles <span className="font-medium">hr_executive</span>, <span className="font-medium">manager_hr</span>, or <span className="font-medium">director_hr</span> are registered in the system.
                  </p>
                ) : (
                  <Select value={selectedExecutive} onValueChange={setSelectedExecutive}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose an HR executive..." />
                    </SelectTrigger>
                    <SelectContent>
                      {hrExecutives.map(exec => (
                        <SelectItem key={exec.id} value={exec.id}>
                          <div className="flex flex-col">
                            <span className="font-medium">{exec.name}</span>
                            <span className="text-xs text-slate-500">{exec.position}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* Notes */}
              <div>
                <label className="text-sm font-medium text-slate-700 mb-2 block">Internal Notes (Optional)</label>
                <Input
                  placeholder="Add any notes for the HR executive..."
                  value={assignmentNotes}
                  onChange={(e) => setAssignmentNotes(e.target.value)}
                  className="text-sm"
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setAssignModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAssignSubmit}
              disabled={assigning || !selectedExecutive}
              className="gap-2 bg-blue-600 hover:bg-blue-700"
            >
              {assigning ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Assigning...
                </>
              ) : (
                <>
                  <ArrowRight className="h-4 w-4" />
                  Assign & Forward
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
