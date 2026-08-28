'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AlertCircle, CalendarDays, CheckCircle2, Clock, Home } from 'lucide-react'
import { format, differenceInDays } from 'date-fns'

interface ResumptionAlert {
  id: string
  resumption_date: string
  status: string
  alert_2_weeks_sent: boolean
  alert_1_week_sent: boolean
  checked_in_date: string | null
  leave: {
    leave_type: string
  }
}

export function StaffResumptionReminder({ userId }: { userId: string }) {
  const [resumptions, setResumptions] = useState<ResumptionAlert[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchResumptions()
  }, [userId])

  const fetchResumptions = async () => {
    try {
      const res = await fetch(`/api/leave/resumption/get-staff-resumptions?userId=${userId}`)
      const data = await res.json()
      if (data.success) {
        setResumptions(data.data || [])
      }
    } catch (error) {
      console.error('[v0] Error fetching resumptions:', error)
    } finally {
      setLoading(false)
    }
  }

  const getUrgencyLevel = (resumptionDate: string) => {
    const today = new Date()
    const daysUntil = differenceInDays(new Date(resumptionDate), today)

    if (daysUntil <= 0) return { level: 'overdue', color: 'text-red-600', bg: 'bg-red-50' }
    if (daysUntil <= 7) return { level: '1-week', color: 'text-orange-600', bg: 'bg-orange-50' }
    if (daysUntil <= 14) return { level: '2-week', color: 'text-amber-600', bg: 'bg-amber-50' }
    return { level: 'upcoming', color: 'text-green-600', bg: 'bg-green-50' }
  }

  if (loading) {
    return (
      <Card className="border-0 shadow-sm">
        <CardContent className="pt-6">
          <div className="flex items-center justify-center py-8">
            <Clock className="h-5 w-5 animate-spin text-slate-400" />
            <p className="ml-2 text-sm text-slate-500">Loading your resumptions...</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Leave Resumption Schedule</h2>
        <p className="text-sm text-slate-600">Your upcoming return to work dates</p>
      </div>

      {resumptions.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center justify-center py-8">
              <Home className="h-8 w-8 text-green-200 mr-3" />
              <div>
                <p className="font-medium text-slate-700">No upcoming resumptions</p>
                <p className="text-sm text-slate-500">Enjoy your leave!</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        resumptions.map((resumption) => {
          const urgency = getUrgencyLevel(resumption.resumption_date)
          const daysUntil = differenceInDays(new Date(resumption.resumption_date), new Date())

          return (
            <Card key={resumption.id} className={`border-l-4 ${urgency.bg} shadow-sm`}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <CalendarDays className={`h-5 w-5 ${urgency.color}`} />
                      <h3 className="font-semibold text-slate-900">
                        {format(new Date(resumption.resumption_date), 'EEEE, MMMM d, yyyy')}
                      </h3>
                      {resumption.status === 'checked_in' && (
                        <Badge className="gap-1 bg-green-600 text-white">
                          <CheckCircle2 className="h-3 w-3" />
                          Checked In
                        </Badge>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3 mt-3">
                      <div className="text-sm">
                        <p className="text-slate-600">Leave Type</p>
                        <p className="font-medium text-slate-900">{resumption.leave.leave_type}</p>
                      </div>
                      <div className="text-sm">
                        <p className="text-slate-600">Days Away</p>
                        <p className="font-medium text-slate-900">
                          {daysUntil > 0 ? `${daysUntil} day(s)` : 'Today'}
                        </p>
                      </div>
                    </div>

                    {resumption.status !== 'checked_in' && (
                      <Alert className={`mt-3 border-l-4 ${urgency.level === 'overdue' ? 'border-red-600 bg-red-50' : 'border-amber-600 bg-amber-50'}`}>
                        <AlertCircle className={`h-4 w-4 ${urgency.level === 'overdue' ? 'text-red-600' : 'text-amber-600'}`} />
                        <AlertDescription className={urgency.level === 'overdue' ? 'text-red-700' : 'text-amber-700'}>
                          {daysUntil <= 0
                            ? 'Expected to report to work today. Please check in through the attendance system.'
                            : daysUntil <= 7
                              ? `Report within ${daysUntil} day(s). Remember to check in through attendance.`
                              : 'Make a note of your resumption date and plan accordingly.'}
                        </AlertDescription>
                      </Alert>
                    )}

                    {resumption.status === 'checked_in' && (
                      <div className="mt-3 p-3 bg-green-100 border border-green-300 rounded">
                        <p className="text-sm text-green-700">
                          Welcome back! Your check-in was recorded on {format(new Date(resumption.checked_in_date!), 'MMM d, yyyy')}
                        </p>
                      </div>
                    )}
                  </div>

                  <Button
                    className="self-start gap-2 bg-blue-600 hover:bg-blue-700 text-white"
                    onClick={() => {
                      // Redirect to attendance check-in
                      window.location.href = '/dashboard/attendance-check'
                    }}
                    disabled={resumption.status === 'checked_in'}
                  >
                    <Home className="h-4 w-4" />
                    Check In
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })
      )}
    </div>
  )
}
