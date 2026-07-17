'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, AlertCircle, CheckCircle2, Clock, FileText, TrendingUp } from 'lucide-react'

interface Stats {
  pendingApprovals: number
  approvedLeave: number
  paymentAdvicePending: number
  paymentAdviceApproved: number
  hodPending: number
}

export function HrExecutiveOverviewPanel() {
  const [stats, setStats] = useState<Stats>({
    pendingApprovals: 0,
    approvedLeave: 0,
    paymentAdvicePending: 0,
    paymentAdviceApproved: 0,
    hodPending: 0,
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true)
        
        // Fetch pending leave requests
        const pendingRes = await fetch('/api/leave/hr-staff-pending-requests')
        const pendingData = pendingRes.ok ? await pendingRes.json() : { requests: [], stats: {} }
        
        // Fetch payment advice stats from memo dashboard
        const memoRes = await fetch('/api/leave/payment-advice/approved-memos')
        const memoData = memoRes.ok ? await memoRes.json() : { memos: [] }
        
        // Calculate stats
        const pendingRequests = pendingData.requests || []
        const approvedRequests = pendingRequests.filter((r: any) => r.status === 'approved').length
        const memoPending = memoData.memos?.filter((m: any) => m.status === 'pending').length || 0
        const memoApproved = memoData.memos?.filter((m: any) => m.status === 'approved').length || 0
        
        setStats({
          pendingApprovals: pendingRequests.filter((r: any) => r.status === 'pending').length,
          approvedLeave: approvedRequests,
          paymentAdvicePending: memoPending,
          paymentAdviceApproved: memoApproved,
          hodPending: pendingData.stats?.hodPending || 0,
        })
      } catch (err) {
        setError('Failed to load statistics')
      } finally {
        setLoading(false)
      }
    }

    fetchStats()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
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
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-1">Leave Management Overview</h2>
        <p className="text-sm text-muted-foreground">Key metrics and pending actions at a glance</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Pending Approvals */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-500" />
              Pending Approvals
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.pendingApprovals}</div>
            <p className="text-xs text-muted-foreground mt-1">Leave requests awaiting decision</p>
          </CardContent>
        </Card>

        {/* Approved Leave */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              Approved Leave
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.approvedLeave}</div>
            <p className="text-xs text-muted-foreground mt-1">Leave approved this period</p>
          </CardContent>
        </Card>

        {/* Payment Advice Pending */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <FileText className="h-4 w-4 text-orange-500" />
              Payment Pending
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.paymentAdvicePending}</div>
            <p className="text-xs text-muted-foreground mt-1">Memos awaiting approval</p>
          </CardContent>
        </Card>

        {/* Payment Advice Approved */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-blue-500" />
              Payment Approved
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.paymentAdviceApproved}</div>
            <p className="text-xs text-muted-foreground mt-1">Memos approved</p>
          </CardContent>
        </Card>

        {/* HOD Pending */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-500" />
              HOD Pending
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.hodPending}</div>
            <p className="text-xs text-muted-foreground mt-1">Awaiting HOD review</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
