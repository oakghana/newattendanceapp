'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Clock, User, Calendar, CheckCircle2, XCircle, Loader2, AlertCircle } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { HODResumptionConfirmations } from './hod-resumption-confirmations'

interface HODReviewSectionProps {
  userDepartmentId: string
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

export function HODReviewSection({ userDepartmentId }: HODReviewSectionProps) {
  const [requests, setRequests] = useState<LeaveRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
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

      const data = await res.json()
      
      // Filter requests for user's department if available
      let requests = Array.isArray(data.requests) ? data.requests : []
      if (userDepartmentId) {
        requests = requests.filter((req: any) => {
          const deptName = req.user_profiles?.departments?.name?.toLowerCase() || ''
          return deptName.includes(userDepartmentId.toLowerCase())
        })
      }
      
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

  const handleApprove = async (requestId: string) => {
    try {
      const res = await fetch(`/api/leave/requests/${requestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'approved', hod_review_status: 'approved' }),
      })

      if (!res.ok) throw new Error('Failed to approve')

      toast({ title: 'Success', description: 'Leave request approved' })
      fetchDepartmentRequests()
    } catch (err) {
      toast({ title: 'Error', description: 'Failed to approve request', variant: 'destructive' })
    }
  }

  const handleDeny = async (requestId: string) => {
    try {
      const res = await fetch(`/api/leave/requests/${requestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'rejected', hod_review_status: 'rejected' }),
      })

      if (!res.ok) throw new Error('Failed to deny')

      toast({ title: 'Success', description: 'Leave request rejected' })
      fetchDepartmentRequests()
    } catch (err) {
      toast({ title: 'Error', description: 'Failed to deny request', variant: 'destructive' })
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

              <div className="mt-4 flex gap-2">
                <Button
                  size="sm"
                  variant="default"
                  className="bg-green-600 hover:bg-green-700"
                  onClick={() => handleApprove(req.id)}
                >
                  <CheckCircle2 className="h-4 w-4 mr-1" />
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => handleDeny(req.id)}
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

      {/* HOD Resumption Confirmations Section */}
      <div>
        <h3 className="text-sm font-semibold mb-3 text-slate-700">Staff Resumption Confirmations</h3>
        <p className="text-xs text-slate-500 mb-3">Confirm that staff members have resumed work after their approved leave</p>
        <HODResumptionConfirmations />
      </div>
    </div>
  )
}
