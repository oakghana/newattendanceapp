'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { CheckCircle2, Clock, User, Calendar, Loader2, AlertCircle, Search } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface ResumptionRequest {
  id: string
  user_id: string
  staff_name?: string
  user_profiles?: {
    first_name?: string
    last_name?: string
    employee_id?: string
  }
  leave_type_key?: string
  preferred_start_date?: string
  preferred_end_date?: string
  status?: string
  hod_confirmed?: boolean
  hod_confirmed_at?: string
  daysOverdue: number
}

interface HODResumptionConfirmationsProps {
  viewerRole?: string | null
}

function canReviewResumptions(role?: string | null) {
  return ['department_head', 'hod', 'regional_manager'].includes(String(role || '').toLowerCase().replace(/[\s-]+/g, '_'))
}

export function HODResumptionConfirmations({ viewerRole }: HODResumptionConfirmationsProps) {
  const [requests, setRequests] = useState<ResumptionRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [dateFilter, setDateFilter] = useState<'all' | 'overdue' | 'today' | 'week'>('all')
  const [actionDialog, setActionDialog] = useState<{ open: boolean; request: ResumptionRequest | null; action: 'confirmed' | 'not_resumed'; notes: string }>({
    open: false,
    request: null,
    action: 'confirmed',
    notes: '',
  })
  const { toast } = useToast()

  // Filter requests by staff name or employee ID
  const filteredRequests = useMemo(() => {
    const term = searchTerm.toLowerCase()
    return requests.filter(req => {
      if (dateFilter === 'overdue' && req.daysOverdue < 1) return false
      if (dateFilter === 'today' && req.daysOverdue !== 0) return false
      if (dateFilter === 'week' && req.daysOverdue > 7) return false
      if (!term.trim()) return true
      const staffName = `${req.user_profiles?.first_name || ''} ${req.user_profiles?.last_name || ''}`.toLowerCase()
      const employeeId = req.user_profiles?.employee_id?.toLowerCase() || ''
      return staffName.includes(term) || employeeId.includes(term)
    })
  }, [requests, searchTerm, dateFilter])

  useEffect(() => {
    if (viewerRole && !canReviewResumptions(viewerRole)) {
      setRequests([])
      setLoading(false)
      return
    }
    fetchResumptionRequests()
  }, [viewerRole])

  const fetchResumptionRequests = async () => {
    try {
      setLoading(true)
      setError(null)

      const res = await fetch('/api/leave/hod-resumption-confirmations')
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`)
      }

      const data = await res.json()
      setRequests(Array.isArray(data.requests) ? data.requests : [])
    } catch (err) {
      console.error('[v0] HOD Resumption fetch error:', err)
      setError('Failed to load resumption requests')
    } finally {
      setLoading(false)
    }
  }

  const openActionDialog = (request: ResumptionRequest, action: 'confirmed' | 'not_resumed') => {
    setActionDialog({ open: true, request, action, notes: '' })
  }

  const handleDecision = async () => {
    if (!actionDialog.request) return
    const requestId = actionDialog.request.id
    setConfirming(requestId)
    try {
      const res = await fetch('/api/leave/hod-confirm-resumption', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leave_plan_request_id: requestId,
          action: actionDialog.action,
          notes: actionDialog.notes.trim() || null,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to confirm')

      toast({
        title: 'Success',
        description: actionDialog.action === 'confirmed' ? 'Staff resumption confirmed' : 'Staff marked as not resumed',
      })
      setActionDialog({ open: false, request: null, action: 'confirmed', notes: '' })
      fetchResumptionRequests()
    } catch (err) {
      toast({ 
        title: 'Error', 
        description: err instanceof Error ? err.message : 'Failed to confirm', 
        variant: 'destructive' 
      })
    } finally {
      setConfirming(null)
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
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Badge className="w-fit bg-orange-100 text-orange-800 border border-orange-200">
          {requests.length} pending confirmation{requests.length === 1 ? '' : 's'}
        </Badge>
        <Select value={dateFilter} onValueChange={(value) => setDateFilter(value as typeof dateFilter)}>
          <SelectTrigger className="h-9 w-full sm:w-44">
            <SelectValue placeholder="Date filter" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All dates</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
            <SelectItem value="today">Due today</SelectItem>
            <SelectItem value="week">This week</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by staff name or employee ID..."
          className="pl-10"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Results Count */}
      <div className="text-sm text-muted-foreground">
        {requests.length === 0 ? (
          <span className="text-green-700 flex items-center gap-1">
            <CheckCircle2 className="h-4 w-4" /> No overdue leaves needing confirmation
          </span>
        ) : (
          `Showing ${filteredRequests.length} of ${requests.length} staff needing confirmation`
        )}
      </div>

      {/* No Search Results */}
      {requests.length > 0 && filteredRequests.length === 0 && searchTerm && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>No staff found matching "{searchTerm}"</AlertDescription>
        </Alert>
      )}

      {/* Request Cards - Only show if there are requests */}
      {requests.length > 0 && filteredRequests.map((req) => {
        const staffName = `${req.user_profiles?.first_name || ''} ${req.user_profiles?.last_name || ''}`.trim() || req.staff_name || 'Unknown'
        const employeeId = req.user_profiles?.employee_id || '—'
        const leaveType = req.leave_type_key || 'Leave'
        const isDarkRed = req.daysOverdue >= 5
        const isRed = req.daysOverdue >= 1

        return (
          <Card 
            key={req.id} 
            className={`transition-all ${
              req.hod_confirmed 
                ? 'border-green-200 bg-green-50/40' 
                : isDarkRed
                ? 'border-red-200 bg-red-50/40'
                : isRed
                ? 'border-amber-200 bg-amber-50/40'
                : 'border-slate-200'
            }`}
          >
            <CardContent className="pt-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="font-medium text-slate-900">{staffName}</p>
                      <p className="text-xs text-muted-foreground">{employeeId}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <Badge variant="outline">{leaveType}</Badge>
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      <span>
                        {req.preferred_end_date
                          ? (() => {
                              const [y, m, d] = req.preferred_end_date.split('-').map(Number)
                              return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                            })()
                          : '—'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <Badge className={
                      isDarkRed ? 'bg-red-600 text-white' :
                      isRed ? 'bg-amber-600 text-white' :
                      'bg-slate-200 text-slate-700'
                    }>
                      {req.daysOverdue} days overdue
                    </Badge>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  {req.hod_confirmed ? (
                    <Badge className="bg-green-600 text-white flex items-center gap-1 w-fit">
                      <CheckCircle2 className="h-3 w-3" />
                      Confirmed
                    </Badge>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                        onClick={() => openActionDialog(req, 'confirmed')}
                        disabled={confirming === req.id}
                      >
                        {confirming === req.id ? (
                          <>
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            Confirming...
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Confirm Return
                          </>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-red-200 text-red-700 hover:bg-red-50"
                        onClick={() => openActionDialog(req, 'not_resumed')}
                        disabled={confirming === req.id}
                      >
                        Not Resumed
                      </Button>
                    </>
                  )}
                  {req.hod_confirmed_at && (
                    <p className="text-xs text-green-600 text-right">
                      Confirmed {new Date(req.hod_confirmed_at).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )
      })}

      <Dialog open={actionDialog.open} onOpenChange={(open) => setActionDialog((current) => ({ ...current, open }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{actionDialog.action === 'confirmed' ? 'Confirm staff return' : 'Mark staff as not resumed'}</DialogTitle>
            <DialogDescription>
              Add a short note for the resumption audit record.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={actionDialog.notes}
            onChange={(event) => setActionDialog((current) => ({ ...current, notes: event.target.value }))}
            placeholder={actionDialog.action === 'confirmed' ? 'e.g., Staff resumed at the district office.' : 'e.g., Staff has not reported back after leave.'}
            rows={4}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialog({ open: false, request: null, action: 'confirmed', notes: '' })} disabled={Boolean(confirming)}>
              Cancel
            </Button>
            <Button onClick={handleDecision} disabled={Boolean(confirming)} className={actionDialog.action === 'not_resumed' ? 'bg-red-600 hover:bg-red-700' : undefined}>
              {confirming ? <Loader2 className="h-4 w-4 animate-spin" /> : actionDialog.action === 'confirmed' ? 'Confirm Return' : 'Mark Not Resumed'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
