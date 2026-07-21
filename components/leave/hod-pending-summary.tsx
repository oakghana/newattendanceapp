'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { AlertCircle, Bell, Send, Loader2 } from 'lucide-react'

interface HodPending {
  hodId: string
  hodName: string
  requests: any[]
  totalPending: number
  oldestDaysPending: number
}

export function HodPendingSummary() {
  const [hodGroups, setHodGroups] = useState<HodPending[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [reminderSent, setReminderSent] = useState(false)

  useEffect(() => {
    const fetchHodPending = async () => {
      try {
        setLoading(true)
        const res = await fetch('/api/leave/hod-pending-requests')
        const data = await res.json()
        setHodGroups(data.hodGroups || [])
      } catch (err) {
        console.error('[v0] Fetch HOD pending error:', err)
        setError('Failed to load HOD pending requests')
      } finally {
        setLoading(false)
      }
    }

    fetchHodPending()
  }, [])

  const handleSendReminders = async () => {
    try {
      setSending(true)
      const res = await fetch('/api/leave/send-hod-reminders', {
        method: 'POST',
      })
      const data = await res.json()

      if (data.success) {
        setReminderSent(true)
        setTimeout(() => setReminderSent(false), 3000)
      } else {
        setError(data.error || 'Failed to send reminders')
      }
    } catch (err) {
      console.error('[v0] Send reminders error:', err)
      setError('Failed to send reminders')
    } finally {
      setSending(false)
    }
  }

  if (loading) {
    return null
  }

  // Only show if there are pending HOD requests with aging >3 days
  const hodWithOldRequests = hodGroups.filter(g => g.oldestDaysPending >= 3)
  if (hodWithOldRequests.length === 0) {
    return null
  }

  return (
    <Card className="border-amber-200 bg-amber-50">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-amber-900">
              <AlertCircle className="h-5 w-5" />
              HOD Requests Pending Review
            </CardTitle>
            <CardDescription className="text-amber-800 mt-1">
              {hodWithOldRequests.length} HOD(s) with requests aging 3+ days
            </CardDescription>
          </div>
          <Button
            onClick={handleSendReminders}
            disabled={sending}
            size="sm"
            className="bg-amber-600 hover:bg-amber-700"
          >
            {sending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Send Reminders
              </>
            )}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {reminderSent && (
          <Alert className="bg-green-50 border-green-200">
            <Bell className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800 ml-2">
              HOD reminders sent successfully
            </AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          {hodWithOldRequests.map((group) => (
            <div
              key={group.hodId}
              className="flex items-center justify-between p-3 bg-white rounded-lg border border-amber-100"
            >
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-amber-900">{group.hodName}</p>
                <p className="text-xs text-amber-700 mt-0.5">
                  {group.totalPending} request(s) • Oldest: {group.oldestDaysPending} days
                </p>
              </div>
              <Badge variant="outline" className="ml-2 bg-red-100 text-red-800 border-red-300">
                {group.oldestDaysPending}d
              </Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
