'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, Search, ChevronDown, Eye, Download, FileText, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { format } from 'date-fns'

interface DefermentRequest {
  id: string
  staff_id: string
  user_profiles?: {
    first_name: string
    last_name: string
    employee_id: string
    position: string
    department_id: string
    departments?: { name: string }
  }
  hr_reviewer?: {
    first_name: string
    last_name: string
  }
  reason: string
  defer_to_leave_year: string
  requested_deferment_year?: number
  requested_deferment_period?: string
  status: 'pending' | 'approved' | 'rejected' | 'pending_hr_assignment' | 'pending_hr_executive'
  created_at: string
  updated_at: string
  leave_plan_requests?: {
    leave_type_key: string
    preferred_start_date: string
    preferred_end_date: string
    adjusted_start_date?: string
    adjusted_end_date?: string
    requested_days: number
    adjusted_days?: number
  }
  // Fallback fields from simple query
  start_date?: string
  end_date?: string
  requested_days?: number
}

interface RecallRequest {
  id: string
  staff_id: string
  staff_user_id?: string
  user_profiles?: {
    first_name: string
    last_name: string
    employee_id: string
    position: string
    department_id: string
    departments?: { name: string }
  }
  requested_by_id?: string
  initiated_by_user_id?: string
  initiator?: {
    id: string
    first_name: string
    last_name: string
    employee_id: string
    position: string
  }
  initiator_name?: string
  hod_reviewer?: {
    first_name: string
    last_name: string
  }
  hr_reviewer?: {
    first_name: string
    last_name: string
  }
  recall_reason: string
  recall_date: string
  status: 'pending' | 'approved' | 'rejected' | 'pending_hr_assignment' | 'pending_hr_executive'
  created_at: string
  updated_at: string
  leave_plan_requests?: {
    leave_type_key: string
    preferred_start_date: string
    preferred_end_date: string
    adjusted_start_date?: string
    adjusted_end_date?: string
  }
  // Fallback fields from simple query
  start_date?: string
  end_date?: string
}

interface DefermentRecallTrackerProps {
  type: 'deferment' | 'recall' | 'all'
  userRole: string
  userDepartment?: string
  userId?: string
}

interface HRExecutive {
  id: string
  name: string
  email: string
  role: string
  position: string
  employee_id: string
}

const HR_LEAVE_OFFICE_ROLES = ['hr_leave_office', 'hr_officer', 'hr_office', 'admin']

const getStatusBadge = (status: string) => {
  switch (status) {
    case 'approved':
      return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100"><CheckCircle className="h-3 w-3 mr-1" />Approved</Badge>
    case 'rejected':
      return <Badge className="bg-red-100 text-red-700 hover:bg-red-100"><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>
    case 'pending':
      return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100"><Clock className="h-3 w-3 mr-1" />Pending</Badge>
    case 'pending_hr_assignment':
      return <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100"><AlertCircle className="h-3 w-3 mr-1" />Awaiting Assignment</Badge>
    case 'pending_hr_executive':
      return <Badge className="bg-purple-100 text-purple-700 hover:bg-purple-100"><Clock className="h-3 w-3 mr-1" />Pending HR Exec</Badge>
    default:
      return <Badge className="bg-slate-100 text-slate-700">{status?.replace(/_/g, ' ')}</Badge>
  }
}

export function DefermentRecallTracker({ type, userRole, userDepartment, userId }: DefermentRecallTrackerProps) {
  const { toast } = useToast()
  const [deferments, setDeferments] = useState<DefermentRequest[]>([])
  const [recalls, setRecalls] = useState<RecallRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  
  // HR Executive assignment state
  const [hrExecutives, setHrExecutives] = useState<HRExecutive[]>([])
  const [selectedExecutive, setSelectedExecutive] = useState<{ [key: string]: string }>({})
  const [assigning, setAssigning] = useState<string | null>(null)
  
  // Check if current user is HR Leave Office
  const normalizedRole = userRole?.toLowerCase().replace(/[-\s]+/g, '_') || ''
  const isHrLeaveOffice = HR_LEAVE_OFFICE_ROLES.includes(normalizedRole)

  useEffect(() => {
    fetchRequests()
    if (isHrLeaveOffice) {
      fetchHrExecutives()
    }
  }, [statusFilter, type, isHrLeaveOffice])

  const fetchHrExecutives = async () => {
    try {
      const res = await fetch('/api/leave/hr-executives')
      if (!res.ok) throw new Error('Failed to fetch HR executives')
      const data = await res.json()
      setHrExecutives(data.executives || [])
    } catch (error) {
      console.error('[v0] Error fetching HR executives:', error)
    }
  }

  const assignToHrExecutive = async (requestId: string, requestType: 'deferment' | 'recall') => {
    const executiveId = selectedExecutive[requestId]
    if (!executiveId) {
      toast({ title: 'Error', description: 'Please select an HR Executive', variant: 'destructive' })
      return
    }

    try {
      setAssigning(requestId)
      const res = await fetch('/api/leave/deferment-recall/assign-to-executive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: requestType,
          requestId: requestId,
          hrExecutiveId: executiveId,
          notes: null
        })
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to assign request')

      toast({ 
        title: 'Success', 
        description: data.message || 'Request assigned successfully'
      })
      
      // Reset state and refresh the list
      setExpandedId(null)
      setSelectedExecutive({...selectedExecutive, [requestId]: ''})
      fetchRequests()
    } catch (error) {
      console.error('[v0] Error assigning request:', error)
      toast({ 
        title: 'Error', 
        description: error instanceof Error ? error.message : 'Failed to assign request', 
        variant: 'destructive' 
      })
    } finally {
      setAssigning(null)
    }
  }

  const fetchRequests = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      params.set('type', type)
      if (statusFilter !== 'all') params.set('status', statusFilter)
      params.set('user_role', userRole)
      if (userDepartment) params.set('user_department', userDepartment)
      // CRITICAL: Pass user_id so the API can filter for normal staff to only see their own requests
      if (userId) params.set('user_id', userId)

      const res = await fetch(`/api/leave/deferment-recall/all?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to fetch requests')

      const data = await res.json()
      if (type === 'deferment' || type === 'all') {
        setDeferments(data.deferments || [])
      }
      if (type === 'recall' || type === 'all') {
        setRecalls(data.recalls || [])
      }
    } catch (error) {
      console.error('[v0] Error fetching requests:', error)
      toast({ title: 'Error', description: 'Failed to load requests', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  const filterRequests = (requests: any[]) => {
    return requests.filter(req => {
      const staffName = `${req.user_profiles?.first_name || ''} ${req.user_profiles?.last_name || ''}`.toLowerCase()
      const initiatorName = req.initiator 
        ? `${req.initiator.first_name || ''} ${req.initiator.last_name || ''}`.toLowerCase()
        : (req.initiator_name || '').toLowerCase()
      const reason = (req.reason || req.recall_reason || '').toLowerCase()
      const search = searchTerm.toLowerCase()
      return staffName.includes(search) || initiatorName.includes(search) || reason.includes(search)
    })
  }

  const renderDefermentCard = (req: DefermentRequest) => {
    const isExpanded = expandedId === req.id
    const staffFirstName = req.user_profiles?.first_name || ''
    const staffLastName = req.user_profiles?.last_name || ''
    const staffName = `${staffFirstName} ${staffLastName}`.trim()
    const hasValidStaffName = !!(staffFirstName || staffLastName)
    
    // Get initiator name - try initiator object first, then initiator_name, then hod_reviewer
    const initiatorName = req.initiator 
      ? `${req.initiator.first_name} ${req.initiator.last_name}`
      : req.initiator_name 
        ? req.initiator_name
        : req.hod_reviewer 
          ? `${req.hod_reviewer.first_name} ${req.hod_reviewer.last_name}`
          : null
    
    const leaveType = req.leave_plan_requests?.leave_type_key?.replace(/_/g, ' ') || 'Annual Leave'
    const deferYear = req.requested_deferment_year || req.defer_to_leave_year || 'N/A'
    
    // Get leave dates - try adjusted dates first, then preferred dates, then fallback fields
    const startDate = req.leave_plan_requests?.adjusted_start_date 
      || req.leave_plan_requests?.preferred_start_date 
      || req.start_date
    const endDate = req.leave_plan_requests?.adjusted_end_date 
      || req.leave_plan_requests?.preferred_end_date 
      || req.end_date
    const leaveDays = req.leave_plan_requests?.adjusted_days 
      || req.leave_plan_requests?.requested_days 
      || req.requested_days 
      || 0

    return (
      <div key={req.id} className="border border-slate-200 rounded-lg overflow-hidden hover:shadow-md transition-shadow">
        <div className="bg-gradient-to-r from-slate-50 to-slate-100/50 p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <div className="flex-1">
                  {hasValidStaffName && (
                    <>
                      <h3 className="font-semibold text-slate-800">{staffName}</h3>
                      <p className="text-xs text-slate-500">{req.user_profiles?.employee_id} • {req.user_profiles?.departments?.name}</p>
                    </>
                  )}
                </div>
                {getStatusBadge(req.status)}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 text-xs">
                {initiatorName && (
                  <div>
                    <p className="text-slate-500">Requested By</p>
                    <p className="font-medium text-slate-700">{initiatorName}</p>
                  </div>
                )}
                <div>
                  <p className="text-slate-500">Leave Type</p>
                  <p className="font-medium text-slate-700 capitalize">{leaveType}</p>
                </div>
                <div>
                  <p className="text-slate-500">Defer To Year</p>
                  <p className="font-medium text-slate-700">{deferYear}</p>
                </div>
                <div>
                  <p className="text-slate-500">Request Date</p>
                  <p className="font-medium text-slate-700">{format(new Date(req.created_at), 'dd MMM yyyy')}</p>
                </div>
              </div>
            </div>
            <button
              onClick={() => setExpandedId(isExpanded ? null : req.id)}
              className="p-2 hover:bg-slate-200 rounded-lg transition-colors"
            >
              <ChevronDown className={`h-5 w-5 text-slate-600 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
            </button>
          </div>
        </div>
        {isExpanded && (
          <div className="border-t border-slate-200 p-4 bg-white space-y-4">
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
                <p className="text-xs font-semibold text-slate-600 mb-1">REQUEST STATUS</p>
                <div className="bg-slate-50 rounded p-3">
                  <p className="text-sm font-medium text-slate-700 capitalize">{req.status.replace(/_/g, ' ')}</p>
                  <p className="text-xs text-slate-500 mt-1">Updated {format(new Date(req.updated_at), 'dd MMM yyyy')}</p>
                </div>
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-600 mb-2">REASON FOR DEFERMENT</p>
              <div className="bg-blue-50 border border-blue-200 rounded p-3">
                <p className="text-sm text-slate-700">{req.reason || 'No reason provided'}</p>
              </div>
            </div>
            
            <div className="flex gap-2 pt-2">
              <Button size="sm" variant="outline" className="gap-2">
                <Eye className="h-4 w-4" />
                View Details
              </Button>
              {req.status === 'pending' && isHrLeaveOffice && (
                <Button 
                  size="sm" 
                  className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
                  onClick={() => {
                    console.log('[v0] Process Request clicked for:', req.id)
                    setExpandedId(`processing-${req.id}`)
                  }}
                >
                  ⚡ Process Request
                </Button>
              )}
              {req.status === 'approved' && (
                <Button size="sm" variant="outline" className="gap-2">
                  <Download className="h-4 w-4" />
                  Download Memo
                </Button>
              )}
            </div>
            
            {/* HR Executive Assignment Section */}
            {expandedId === `processing-${req.id}` && isHrLeaveOffice && (
              <div className="border-t border-blue-200 p-4 bg-blue-50 space-y-3">
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-2 w-2 bg-blue-600 rounded-full" />
                  <p className="text-sm font-semibold text-blue-900">Assign to HR Executive for Approval</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-700 mb-2 block">Select HR Executive</label>
                  <Select 
                    value={selectedExecutive[req.id] || ''}
                    onValueChange={(val) => setSelectedExecutive({...selectedExecutive, [req.id]: val})}
                  >
                    <SelectTrigger className="bg-white">
                      <SelectValue placeholder="Choose an HR Executive..." />
                    </SelectTrigger>
                    <SelectContent>
                      {hrExecutives.map((exec) => (
                        <SelectItem key={exec.id} value={exec.id}>
                          {exec.name} - {exec.position}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 flex-1"
                    onClick={() => assignToHrExecutive(req.id, 'deferment')}
                    disabled={assigning === req.id || !selectedExecutive[req.id]}
                  >
                    {assigning === req.id && <Loader2 className="h-4 w-4 animate-spin" />}
                    {assigning === req.id ? 'Assigning...' : 'Confirm & Forward'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setExpandedId(null)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  const renderRecallCard = (req: RecallRequest) => {
    const isExpanded = expandedId === req.id
    const staffFirstName = req.user_profiles?.first_name || ''
    const staffLastName = req.user_profiles?.last_name || ''
    const staffName = `${staffFirstName} ${staffLastName}`.trim()
    const hasValidStaffName = !!(staffFirstName || staffLastName)
    
    // Get initiator name - try initiator object first, then initiator_name, then hod_reviewer
    const initiatorName = req.initiator 
      ? `${req.initiator.first_name} ${req.initiator.last_name}`
      : req.initiator_name 
        ? req.initiator_name
        : req.hod_reviewer 
          ? `${req.hod_reviewer.first_name} ${req.hod_reviewer.last_name}`
          : null
    
    // Get leave dates - try adjusted dates first, then preferred dates, then fallback fields
    const startDate = req.leave_plan_requests?.adjusted_start_date 
      || req.leave_plan_requests?.preferred_start_date 
      || req.start_date
    const endDate = req.leave_plan_requests?.adjusted_end_date 
      || req.leave_plan_requests?.preferred_end_date 
      || req.end_date

    return (
      <div key={req.id} className="border border-slate-200 rounded-lg overflow-hidden hover:shadow-md transition-shadow">
        <div className="bg-gradient-to-r from-slate-50 to-slate-100/50 p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <div className="flex-1">
                  {hasValidStaffName && (
                    <>
                      <h3 className="font-semibold text-slate-800">{staffName}</h3>
                      <p className="text-xs text-slate-500">{req.user_profiles?.employee_id} • {req.user_profiles?.departments?.name}</p>
                    </>
                  )}
                </div>
                {getStatusBadge(req.status)}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 text-xs">
                {initiatorName && (
                  <div>
                    <p className="text-slate-500">Requested By</p>
                    <p className="font-medium text-slate-700">{initiatorName}</p>
                  </div>
                )}
                <div>
                  <p className="text-slate-500">Recall Date</p>
                  <p className="font-medium text-slate-700">{req.recall_date ? format(new Date(req.recall_date), 'dd MMM yyyy') : 'N/A'}</p>
                </div>
                <div>
                  <p className="text-slate-500">Type</p>
                  <p className="font-medium text-slate-700 capitalize">Leave Recall</p>
                </div>
                <div>
                  <p className="text-slate-500">Request Date</p>
                  <p className="font-medium text-slate-700">{format(new Date(req.created_at), 'dd MMM yyyy')}</p>
                </div>
              </div>
            </div>
            <button
              onClick={() => setExpandedId(isExpanded ? null : req.id)}
              className="p-2 hover:bg-slate-200 rounded-lg transition-colors"
            >
              <ChevronDown className={`h-5 w-5 text-slate-600 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
            </button>
          </div>
        </div>
        {isExpanded && (
          <div className="border-t border-slate-200 p-4 bg-white space-y-4">
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
                <p className="text-xs font-semibold text-slate-600 mb-1">REQUEST STATUS</p>
                <div className="bg-slate-50 rounded p-3">
                  <p className="text-sm font-medium text-slate-700 capitalize">{req.status.replace(/_/g, ' ')}</p>
                  <p className="text-xs text-slate-500 mt-1">Updated {format(new Date(req.updated_at), 'dd MMM yyyy')}</p>
                </div>
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-600 mb-2">REASON FOR RECALL</p>
              <div className="bg-red-50 border border-red-200 rounded p-3">
                <p className="text-sm text-slate-700">{req.recall_reason || 'No reason provided'}</p>
              </div>
            </div>
            
            <div className="flex gap-2 pt-2">
              <Button size="sm" variant="outline" className="gap-2">
                <Eye className="h-4 w-4" />
                View Details
              </Button>
              {req.status === 'pending' && isHrLeaveOffice && (
                <Button 
                  size="sm" 
                  className="gap-2 bg-rose-600 hover:bg-rose-700 text-white"
                  onClick={() => {
                    console.log('[v0] Process Request clicked for recall:', req.id)
                    setExpandedId(`processing-${req.id}`)
                  }}
                >
                  ⚡ Process Request
                </Button>
              )}
              {req.status === 'approved' && (
                <Button size="sm" variant="outline" className="gap-2">
                  <Download className="h-4 w-4" />
                  Download Memo
                </Button>
              )}
            </div>
            
            {/* HR Executive Assignment Section */}
            {expandedId === `processing-${req.id}` && isHrLeaveOffice && (
              <div className="border-t border-rose-200 p-4 bg-rose-50 space-y-3">
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-2 w-2 bg-rose-600 rounded-full" />
                  <p className="text-sm font-semibold text-rose-900">Assign to HR Executive for Approval</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-700 mb-2 block">Select HR Executive</label>
                  <Select 
                    value={selectedExecutive[req.id] || ''}
                    onValueChange={(val) => setSelectedExecutive({...selectedExecutive, [req.id]: val})}
                  >
                    <SelectTrigger className="bg-white">
                      <SelectValue placeholder="Choose an HR Executive..." />
                    </SelectTrigger>
                    <SelectContent>
                      {hrExecutives.map((exec) => (
                        <SelectItem key={exec.id} value={exec.id}>
                          {exec.name} - {exec.position}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 flex-1"
                    onClick={() => assignToHrExecutive(req.id, 'recall')}
                    disabled={assigning === req.id || !selectedExecutive[req.id]}
                  >
                    {assigning === req.id && <Loader2 className="h-4 w-4 animate-spin" />}
                    {assigning === req.id ? 'Assigning...' : 'Confirm & Forward'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setExpandedId(null)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  const allRequests = type === 'all' ? [...deferments, ...recalls] : type === 'deferment' ? deferments : recalls
  const filteredRequests = filterRequests(allRequests)

  return (
    <div className="space-y-4">
      {/* Search and Filter Bar */}
      <Card className="border-0 shadow-sm">
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="relative md:col-span-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
              <Input
                placeholder="Search by staff name, HOD/RM name, or reason..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={(val) => setStatusFilter(val as any)}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Summary Stats */}
      {!loading && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="bg-gradient-to-br from-amber-50 to-amber-100/50 rounded-lg border border-amber-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-200 rounded-lg">
                <Clock className="h-5 w-5 text-amber-700" />
              </div>
              <div>
                <p className="text-2xl font-bold text-amber-700">{filteredRequests.filter(r => r.status === 'pending').length}</p>
                <p className="text-xs text-amber-600">Pending Requests</p>
              </div>
            </div>
          </div>
          <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 rounded-lg border border-emerald-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-200 rounded-lg">
                <CheckCircle className="h-5 w-5 text-emerald-700" />
              </div>
              <div>
                <p className="text-2xl font-bold text-emerald-700">{filteredRequests.filter(r => r.status === 'approved').length}</p>
                <p className="text-xs text-emerald-600">Approved</p>
              </div>
            </div>
          </div>
          <div className="bg-gradient-to-br from-red-50 to-red-100/50 rounded-lg border border-red-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-200 rounded-lg">
                <XCircle className="h-5 w-5 text-red-700" />
              </div>
              <div>
                <p className="text-2xl font-bold text-red-700">{filteredRequests.filter(r => r.status === 'rejected').length}</p>
                <p className="text-xs text-red-600">Rejected</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        </div>
      )}

      {/* Empty State */}
      {!loading && filteredRequests.length === 0 && (
        <div className="text-center py-12 bg-slate-50 rounded-lg border border-dashed border-slate-300">
          <AlertCircle className="h-12 w-12 text-slate-300 mx-auto mb-3" />
          <h3 className="font-semibold text-slate-600 mb-1">No requests found</h3>
          <p className="text-sm text-slate-500">Try adjusting your search or filters</p>
        </div>
      )}

      {/* Requests List */}
      {!loading && filteredRequests.length > 0 && (
        <div className="space-y-3">
          {type === 'deferment' || type === 'all' ? (
            <>
              {(type === 'all' && deferments.length > 0) && (
                <div>
                  <h3 className="text-sm font-semibold text-slate-600 mb-3 px-2">Leave Deferments</h3>
                  <div className="space-y-3">
                    {filterRequests(deferments).map(renderDefermentCard)}
                  </div>
                </div>
              )}
              {type === 'deferment' && filterRequests(deferments).map(renderDefermentCard)}
            </>
          ) : null}

          {type === 'recall' || type === 'all' ? (
            <>
              {(type === 'all' && recalls.length > 0) && (
                <div>
                  <h3 className="text-sm font-semibold text-slate-600 mb-3 px-2">Leave Recalls</h3>
                  <div className="space-y-3">
                    {filterRequests(recalls).map(renderRecallCard)}
                  </div>
                </div>
              )}
              {type === 'recall' && filterRequests(recalls).map(renderRecallCard)}
            </>
          ) : null}
        </div>
      )}
    </div>
  )
}
