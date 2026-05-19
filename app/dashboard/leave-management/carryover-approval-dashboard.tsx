'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, CheckCircle, XCircle, Clock, AlertCircle } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { createClient } from '@/lib/supabase/client'
import { createClient } from '@/lib/supabase/client'

interface CarryoverRequest {
  id: string
  staff_id: string
  leave_year: string
  leave_type_key: string
  balance_available: number
  max_carryover_allowed: number
  requested_carryover_days: number
  status: string
  requested_at: string
  approval_note: string
  staff: {
    email: string
    first_name: string
    last_name: string
    employee_id: string
    department: string
    location: string
  }
}

export function CarryoverApprovalDashboard() {
  const [carryoverRequests, setCarryoverRequests] = useState<CarryoverRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL'>('ALL')
  const [stats, setStats] = useState({ pending: 0, approved: 0, rejected: 0, totalDays: 0 })
  const { toast } = useToast()

  useEffect(() => {
    fetchPendingCarryovers()
  }, [filterStatus])

  const fetchPendingCarryovers = async () => {
    setLoading(true)
    try {
      const status = filterStatus === 'ALL' ? '' : `status=${filterStatus}`
      const res = await fetch(`/api/leave/carryover/pending?${status}&limit=100`)
      const data = await res.json()
      setCarryoverRequests(data.carryover_requests || [])
      if (data.stats) {
        setStats(data.stats)
      }
    } catch (error) {
      console.error('[v0] Failed to fetch carryover requests:', error)
      toast({
        title: 'Error',
        description: 'Failed to load carryover requests',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }


  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'PENDING':
        return <Clock className="h-4 w-4" />
      case 'APPROVED':
        return <CheckCircle className="h-4 w-4" />
      case 'REJECTED':
        return <XCircle className="h-4 w-4" />
      default:
        return null
    }
  }

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-600">Pending</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-amber-700">
              {stats.pending}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-600">Approved</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-emerald-700">
              {stats.approved}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-600">Rejected</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-700">
              {stats.rejected}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-600">Total Days</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-700">
              {stats.totalDays}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2">
        {['PENDING', 'APPROVED', 'REJECTED', 'ALL'].map(status => (
          <Button
            key={status}
            variant={filterStatus === status ? 'default' : 'outline'}
            onClick={() => setFilterStatus(status as any)}
            className="gap-2"
          >
            {status}
          </Button>
        ))}
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          <span className="ml-2 text-slate-500">Loading carryover requests...</span>
        </div>
      )}

      {/* Empty State */}
      {!loading && carryoverRequests.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="mx-auto h-8 w-8 text-slate-400 mb-2" />
            <p className="text-slate-600">No carryover requests found</p>
          </CardContent>
        </Card>
      )}

      {/* Requests List */}
      {!loading && carryoverRequests.length > 0 && (
        <div className="grid gap-4">
          {carryoverRequests.map(request => (
            <Card key={request.id} className="border-l-4 border-l-amber-400">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <CardTitle className="text-base">
                        {request.staff.first_name} {request.staff.last_name}
                      </CardTitle>
                      <Badge variant="outline" className={getStatusColor(request.status)}>
                        {getStatusIcon(request.status)}
                        <span className="ml-1">{request.status}</span>
                      </Badge>
                    </div>
                    <CardDescription className="text-xs">
                      ID: {request.staff.employee_id} • {request.staff.department} • {request.staff.location}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                {/* Balance Info */}
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div className="rounded-lg bg-blue-50 p-3">
                    <p className="text-xs text-slate-600 font-medium">Available Balance</p>
                    <p className="text-lg font-bold text-blue-700">{request.balance_available} days</p>
                  </div>
                  <div className="rounded-lg bg-amber-50 p-3">
                    <p className="text-xs text-slate-600 font-medium">Requested</p>
                    <p className="text-lg font-bold text-amber-700">{request.requested_carryover_days} days</p>
                  </div>
                  <div className="rounded-lg bg-emerald-50 p-3">
                    <p className="text-xs text-slate-600 font-medium">Max Allowed</p>
                    <p className="text-lg font-bold text-emerald-700">{request.max_carryover_allowed} days</p>
                  </div>
                </div>

                {/* Reason */}
                {request.approval_note && (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription className="text-xs">
                      <strong>Reason:</strong> {request.approval_note}
                    </AlertDescription>
                  </Alert>
                )}

                {/* Auto-Approval Notice */}
                {request.status === 'PENDING' && (
                  <Alert className="bg-blue-50 border-blue-200 text-blue-900">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      This carryover request will be automatically approved by the system.
                    </AlertDescription>
                  </Alert>
                )}

                {/* Meta Info */}
                <div className="text-xs text-slate-500 border-t pt-2">
                  <p>Requested: {new Date(request.requested_at).toLocaleDateString()}</p>
                  <p>Leave Year: {request.leave_year}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
