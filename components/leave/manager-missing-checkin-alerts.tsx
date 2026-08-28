'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AlertTriangle, Clock, User, CheckCircle2 } from 'lucide-react'
import { format } from 'date-fns'

interface MissingCheckInAlert {
  id: string
  user: {
    first_name: string
    last_name: string
    employee_id: string
    email: string
  }
  resumption_date: string
  leave: {
    leave_type: string
  }
  hod_rm_alert_sent_at: string
  hod_rm_alert_acknowledged: boolean
  hod_rm_alert_acknowledged_at: string | null
  hod_rm_alert_acknowledged_by: string | null
}

export function ManagerMissingCheckInAlerts({ managerId, userRole }: { managerId: string; userRole: string }) {
  const [alerts, setAlerts] = useState<MissingCheckInAlert[]>([])
  const [loading, setLoading] = useState(true)
  const [acknowledging, setAcknowledging] = useState<string | null>(null)

  useEffect(() => {
    fetchAlerts()
  }, [managerId])

  const fetchAlerts = async () => {
    try {
      const res = await fetch(`/api/leave/resumption/manager-missing-checkins?managerId=${managerId}&role=${userRole}`)
      const data = await res.json()
      if (data.success) {
        setAlerts(data.data || [])
      }
    } catch (error) {
      console.error('[v0] Error fetching missing check-in alerts:', error)
    } finally {
      setLoading(false)
    }
  }

  const acknowledgeAlert = async (alertId: string) => {
    try {
      setAcknowledging(alertId)
      const res = await fetch('/api/leave/resumption/acknowledge-alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          alertId,
          acknowledgedBy: managerId
        })
      })

      const data = await res.json()
      if (data.success) {
        setAlerts(alerts.map(a => a.id === alertId ? { ...a, hod_rm_alert_acknowledged: true, hod_rm_alert_acknowledged_at: new Date().toISOString() } : a))
      }
    } catch (error) {
      console.error('[v0] Error acknowledging alert:', error)
    } finally {
      setAcknowledging(null)
    }
  }

  if (loading) {
    return (
      <Card className="border-0 shadow-sm">
        <CardContent className="pt-6">
          <div className="flex items-center justify-center py-8">
            <Clock className="h-5 w-5 animate-spin text-slate-400" />
            <p className="ml-2 text-sm text-slate-500">Loading alerts...</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Staff Missing Check-In Alerts</h2>
        <p className="text-sm text-slate-600">Staff who should have reported but haven&apos;t checked in</p>
      </div>

      {alerts.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center justify-center py-8">
              <CheckCircle2 className="h-8 w-8 text-green-500 mr-3" />
              <div>
                <p className="font-medium text-slate-700">All staff checked in</p>
                <p className="text-sm text-slate-500">No missing check-ins to report</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {alerts.map((alert) => (
            <Card key={alert.id} className="border-l-4 border-l-red-500 bg-red-50 shadow-sm">
              <CardContent className="pt-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle className="h-5 w-5 text-red-600" />
                      <h3 className="font-semibold text-slate-900">
                        {alert.user.first_name} {alert.user.last_name}
                      </h3>
                      {alert.hod_rm_alert_acknowledged && (
                        <Badge className="gap-1 bg-blue-600 text-white">
                          <CheckCircle2 className="h-3 w-3" />
                          Acknowledged
                        </Badge>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3 mt-3 text-sm">
                      <div>
                        <p className="text-slate-600">Employee ID</p>
                        <p className="font-medium text-slate-900">{alert.user.employee_id}</p>
                      </div>
                      <div>
                        <p className="text-slate-600">Expected Date</p>
                        <p className="font-medium text-slate-900">
                          {format(new Date(alert.resumption_date), 'MMM d, yyyy')}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-600">Leave Type</p>
                        <p className="font-medium text-slate-900">{alert.leave.leave_type}</p>
                      </div>
                      <div>
                        <p className="text-slate-600">Email</p>
                        <p className="font-medium text-blue-600 text-xs">{alert.user.email}</p>
                      </div>
                    </div>

                    <Alert className="mt-3 border-l-4 border-red-600 bg-white">
                      <AlertTriangle className="h-4 w-4 text-red-600" />
                      <AlertDescription className="text-red-700">
                        {alert.user.first_name} {alert.user.last_name} was expected to report on{' '}
                        {format(new Date(alert.resumption_date), 'MMM d, yyyy')} but has not checked in. Please follow up.
                      </AlertDescription>
                    </Alert>
                  </div>

                  <Button
                    className="self-start gap-2 bg-blue-600 hover:bg-blue-700 text-white whitespace-nowrap"
                    onClick={() => acknowledgeAlert(alert.id)}
                    disabled={acknowledging === alert.id || alert.hod_rm_alert_acknowledged}
                  >
                    {acknowledging === alert.id ? (
                      <>
                        <Clock className="h-4 w-4 animate-spin" />
                        Acknowledging...
                      </>
                    ) : alert.hod_rm_alert_acknowledged ? (
                      <>
                        <CheckCircle2 className="h-4 w-4" />
                        Acknowledged
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-4 w-4" />
                        Mark Acknowledged
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
