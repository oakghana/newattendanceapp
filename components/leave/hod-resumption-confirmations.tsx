'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { CheckCircle2, Clock, User, Calendar, Loader2, AlertCircle, Toggle } from 'lucide-react'
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

export function HODResumptionConfirmations() {
  const [requests, setRequests] = useState<ResumptionRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    fetchResumptionRequests()
  }, [])

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

  const handleConfirm = async (requestId: string) => {
    setConfirming(requestId)
    try {
      const res = await fetch('/api/leave/hod-confirm-resumption', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leave_plan_request_id: requestId }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to confirm')

      toast({ title: 'Success', description: 'Staff resumption confirmed' })
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

  if (requests.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6 text-center text-muted-foreground">
          <CheckCircle2 className="h-12 w-12 mx-auto mb-2 text-green-500" />
          <p>No staff resumption confirmations needed</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {requests.map((req) => {
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
                      <span>{new Date(req.preferred_end_date || '').toLocaleDateString()}</span>
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
                    <Button
                      size="sm"
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                      onClick={() => handleConfirm(req.id)}
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
    </div>
  )
}
