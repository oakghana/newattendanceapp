'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Checkbox } from '@/components/ui/checkbox'
import { Loader2, Lock, Unlock, FileText, CheckCircle, Clock, AlertCircle } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface PaymentAdviceMemo {
  id: string
  month_year: string
  month_name: string
  year: number
  staff_count: number
  total_days: number
  created_at: string
  created_by: string
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED'
  approval_status: 'PENDING' | 'APPROVED' | 'REJECTED'
  approved_by?: string
  approved_at?: string
  memo_subject: string
  is_locked: boolean
}

export function PaymentAdviceTrackingDashboard() {
  const [memos, setMemos] = useState<PaymentAdviceMemo[]>([])
  const [loading, setLoading] = useState(true)
  const [lockedMonths, setLockedMonths] = useState<Set<string>>(new Set())
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('ALL')
  const [selectedMemos, setSelectedMemos] = useState<Set<string>>(new Set())
  const [unlockedForException, setUnlockedForException] = useState<Set<string>>(new Set())
  const { toast } = useToast()

  useEffect(() => {
    fetchPaymentAdviceMemos()
  }, [filterStatus])

  const fetchPaymentAdviceMemos = async () => {
    setLoading(true)
    try {
      const response = await fetch(
        `/api/leave/payment-advice/tracking?status=${filterStatus}`,
        {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        }
      )

      if (!response.ok) throw new Error('Failed to fetch memos')

      const data = await response.json()
      setMemos(data.memos || [])
      
      // Extract locked months
      const locked = new Set(
        (data.memos || [])
          .filter((m: PaymentAdviceMemo) => m.is_locked)
          .map((m: PaymentAdviceMemo) => m.month_year)
      )
      setLockedMonths(locked)
    } catch (error: any) {
      console.error('[v0] Error fetching memos:', error)
      toast({
        title: 'Error',
        description: 'Failed to load payment advice memos',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const toggleLockMonth = async (monthYear: string, isLocked: boolean) => {
    try {
      const res = await fetch('/api/leave/payment-advice/lock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month_year: monthYear,
          is_locked: !isLocked,
          reason: isLocked ? 'Unlocked for exception' : 'Lock month to prevent duplicates',
        }),
      })

      if (!res.ok) throw new Error('Failed to update lock status')

      toast({
        title: 'Success',
        description: `Month ${isLocked ? 'unlocked' : 'locked'} successfully`,
      })

      if (!isLocked) {
        setUnlockedForException(new Set([...unlockedForException, monthYear]))
      } else {
        setUnlockedForException(
          new Set([...unlockedForException].filter(m => m !== monthYear))
        )
      }

      fetchPaymentAdviceMemos()
    } catch (error: any) {
      console.error('[v0] Lock/unlock error:', error)
      toast({
        title: 'Error',
        description: error.message || 'Failed to update lock status',
        variant: 'destructive',
      })
    }
  }

  const getStatusIcon = (status: 'PENDING' | 'APPROVED' | 'REJECTED') => {
    switch (status) {
      case 'APPROVED':
        return <CheckCircle className="h-4 w-4 text-emerald-600" />
      case 'REJECTED':
        return <AlertCircle className="h-4 w-4 text-red-600" />
      default:
        return <Clock className="h-4 w-4 text-amber-600" />
    }
  }

  const getStatusBadge = (status: 'PENDING' | 'APPROVED' | 'REJECTED') => {
    switch (status) {
      case 'APPROVED':
        return <Badge className="bg-emerald-100 text-emerald-900">Approved</Badge>
      case 'REJECTED':
        return <Badge className="bg-red-100 text-red-900">Rejected</Badge>
      default:
        return <Badge className="bg-amber-100 text-amber-900">Pending Review</Badge>
    }
  }

  const stats = {
    total: memos.length,
    approved: memos.filter(m => m.approval_status === 'APPROVED').length,
    pending: memos.filter(m => m.approval_status === 'PENDING').length,
    rejected: memos.filter(m => m.approval_status === 'REJECTED').length,
  }

  return (
    <div className="space-y-6 w-full">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Total Memos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-slate-900">{stats.total}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-emerald-600">Approved</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-emerald-600">{stats.approved}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-amber-600">Pending</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-amber-600">{stats.pending}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-red-600">Rejected</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-600">{stats.rejected}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 flex-wrap">
        {(['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as const).map(status => (
          <Button
            key={status}
            variant={filterStatus === status ? 'default' : 'outline'}
            onClick={() => setFilterStatus(status)}
            className="text-sm"
          >
            {status === 'ALL' ? 'All Memos' : status}
          </Button>
        ))}
      </div>

      {/* Information Alert */}
      <Alert className="bg-blue-50 border-blue-200">
        <AlertCircle className="h-4 w-4 text-blue-900" />
        <AlertDescription className="text-blue-900">
          Locked months prevent accidental duplicate payment advice submissions. Use the unlock option only for exceptional cases where payment advice needs to be regenerated for a month.
        </AlertDescription>
      </Alert>

      {/* Memos List */}
      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        </div>
      ) : memos.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-slate-500">
            No payment advice memos found for this filter
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {memos.map(memo => (
            <Card key={memo.id} className="overflow-hidden hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <FileText className="h-4 w-4 text-slate-500" />
                      <CardTitle className="text-lg">
                        {memo.month_name} {memo.year}
                      </CardTitle>
                      {memo.is_locked && (
                        <Lock className="h-4 w-4 text-red-600" title="This month is locked" />
                      )}
                    </div>
                    <CardDescription className="text-xs">
                      {memo.staff_count} staff • {memo.total_days} total days
                    </CardDescription>
                  </div>

                  <div className="flex items-center gap-2">
                    {getStatusIcon(memo.approval_status)}
                    {getStatusBadge(memo.approval_status)}
                  </div>
                </div>
              </CardHeader>

              <CardContent>
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="text-slate-600">Subject:</span>
                    <p className="font-medium text-slate-900">{memo.memo_subject}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-slate-600">Created:</span>
                      <p className="font-medium text-slate-900">
                        {new Date(memo.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    {memo.approved_at && (
                      <div>
                        <span className="text-slate-600">
                          {memo.approval_status === 'APPROVED' ? 'Approved' : 'Reviewed'}:
                        </span>
                        <p className="font-medium text-slate-900">
                          {new Date(memo.approved_at).toLocaleDateString()}
                        </p>
                      </div>
                    )}
                  </div>

                  {memo.approval_status === 'PENDING' && (
                    <Alert className="bg-amber-50 border-amber-200 mt-2">
                      <Clock className="h-4 w-4 text-amber-900" />
                      <AlertDescription className="text-amber-900 text-xs">
                        Awaiting approval from HR Executive
                      </AlertDescription>
                    </Alert>
                  )}

                  {memo.approval_status === 'REJECTED' && (
                    <Alert className="bg-red-50 border-red-200 mt-2">
                      <AlertCircle className="h-4 w-4 text-red-900" />
                      <AlertDescription className="text-red-900 text-xs">
                        Rejected by HR Executive - may need resubmission
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* Lock/Unlock Controls */}
                  <div className="pt-2 border-t flex items-center justify-between">
                    <span className="text-xs text-slate-600">
                      {memo.is_locked ? 'Month is locked' : 'Month is unlocked'}
                    </span>
                    <Button
                      size="sm"
                      variant={memo.is_locked ? 'destructive' : 'outline'}
                      onClick={() => toggleLockMonth(memo.month_year, memo.is_locked)}
                      className="text-xs"
                    >
                      {memo.is_locked ? (
                        <>
                          <Unlock className="h-3 w-3 mr-1" />
                          Unlock (Exception)
                        </>
                      ) : (
                        <>
                          <Lock className="h-3 w-3 mr-1" />
                          Lock Month
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
