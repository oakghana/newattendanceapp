'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, AlertCircle, CheckCircle2, Clock, FileText, TrendingUp } from 'lucide-react'
import { RequestDetailsModal } from './request-details-modal'
import { HodPendingSummary } from './hod-pending-summary'

interface Stats {
  pendingApprovals: number
  approvedLeave: number
  paymentAdvicePending: number
  paymentAdviceApproved: number
  hodPending: number
}

interface HrExecutiveOverviewPanelProps {
  onNavigateToTab?: (tab: 'overview' | 'leave-approvals' | 'analytics' | 'balance-calendar') => void
}

export function HrExecutiveOverviewPanel({ onNavigateToTab }: HrExecutiveOverviewPanelProps) {
  const [stats, setStats] = useState<Stats>({
    pendingApprovals: 0,
    approvedLeave: 0,
    paymentAdvicePending: 0,
    paymentAdviceApproved: 0,
    hodPending: 0,
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [modalFilter, setModalFilter] = useState<'pending' | 'approved' | 'payment-pending' | 'payment-approved' | 'hod-pending'>('pending')
  const [modalTitle, setModalTitle] = useState('')

  const openModal = (filter: typeof modalFilter, title: string) => {
    setModalFilter(filter)
    setModalTitle(title)
    setModalOpen(true)
  }

  const handleCardClick = (filter: typeof modalFilter, title: string) => {
    // If we have a navigation callback, go to the Leave Approvals tab
    if (onNavigateToTab && filter === 'pending') {
      onNavigateToTab('leave-approvals')
    } else {
      openModal(filter, title)
    }
  }

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true)
        
        // Fetch pending leave requests from HR staff pending requests
        const pendingRes = await fetch('/api/leave/hr-staff-pending-requests')
        const pendingData = pendingRes.ok ? await pendingRes.json() : { requests: [], stats: {} }
        
        // Fetch all leave requests to get approved and HOD pending counts
        const allRequestsRes = await fetch('/api/leave/requests?limit=1000')
        const allRequestsData = allRequestsRes.ok ? await allRequestsRes.json() : { records: [] }
        
        // Fetch payment advice pending memos awaiting HR approval
        const pendingMemosRes = await fetch('/api/leave/payment-advice/pending-approval')
        const pendingMemosData = pendingMemosRes.ok ? await pendingMemosRes.json() : { memos: [] }
        
        // Fetch approved payment memos
        const approvedMemosRes = await fetch('/api/leave/payment-advice/approved-memos')
        const approvedMemosData = approvedMemosRes.ok ? await approvedMemosRes.json() : { memos: [] }
        
        // Get requests data — endpoint returns { data, total }
        const pendingRequests = pendingData.requests || []
        const allRequests = allRequestsData.data || allRequestsData.records || []

        // Count approved leave — DB statuses are 'hr_approved', 'hod_approved', 'approved', etc.
        const APPROVED_STATUSES = ['approved', 'hr_approved', 'hod_approved', 'finalized', 'completed']
        const approvedLeave = allRequests.filter((r: any) =>
          APPROVED_STATUSES.includes(r.status)
        ).length

        // Count HOD pending — DB status is 'pending_hod_review'
        const HOD_PENDING_STATUSES = ['pending_hod_review', 'hod_review', 'pending_hod']
        const hodPending = allRequests.filter((r: any) =>
          HOD_PENDING_STATUSES.includes(r.status)
        ).length
        
        // Count payment memos
        const paymentPending = (pendingMemosData.memos || []).length
        const paymentApproved = (approvedMemosData.memos || []).length
        
        setStats({
          pendingApprovals: pendingRequests.length,
          approvedLeave: approvedLeave,
          paymentAdvicePending: paymentPending,
          paymentAdviceApproved: paymentApproved,
          hodPending: hodPending,
        })
      } catch (err) {
        console.error('[v0] Stats fetch error:', err)
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

      <HodPendingSummary />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Pending Approvals */}
        <button
          onClick={() => handleCardClick('pending', 'Pending Leave Approvals')}
          className="text-left hover:shadow-md transition-shadow"
        >
          <Card className="cursor-pointer h-full hover:border-primary/50">
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
        </button>

        {/* Approved Leave */}
        <button
          onClick={() => openModal('approved', 'Approved Leave Requests')}
          className="text-left hover:shadow-md transition-shadow"
        >
          <Card className="cursor-pointer h-full hover:border-primary/50">
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
        </button>

        {/* Payment Advice Pending */}
        <button
          onClick={() => openModal('payment-pending', 'Pending Payment Advice')}
          className="text-left hover:shadow-md transition-shadow"
        >
          <Card className="cursor-pointer h-full hover:border-primary/50">
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
        </button>

        {/* Payment Advice Approved */}
        <button
          onClick={() => openModal('payment-approved', 'Approved Payment Advice')}
          className="text-left hover:shadow-md transition-shadow"
        >
          <Card className="cursor-pointer h-full hover:border-primary/50">
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
        </button>

        {/* HOD Pending */}
        <button
          onClick={() => openModal('hod-pending', 'Pending HOD Review')}
          className="text-left hover:shadow-md transition-shadow"
        >
          <Card className="cursor-pointer h-full hover:border-primary/50">
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
        </button>
      </div>

      {/* Request Details Modal */}
      <RequestDetailsModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        title={modalTitle}
        filter={modalFilter}
      />
    </div>
  )
}
