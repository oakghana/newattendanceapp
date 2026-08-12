'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertTriangle, Clock, Lock, Info } from 'lucide-react'
import Link from 'next/link'

interface ComplianceData {
  compliance: {
    isAnnualLeaveReminder: boolean
    daysUntilDeadline: number
    isLocked: boolean
    shouldShowGrantAwareness: boolean
    pendingEndorsements: number
    escalationDue: boolean
  }
  reminders: any[]
  escalations: any[]
  daysLeft: number
  isReminderPeriod: boolean
}

export function AnnualLeaveCompliancePanel() {
  const [data, setData] = useState<ComplianceData | null>(null)
  const [loading, setLoading] = useState(true)
  const [dismissed, setDismissed] = useState(false)

  const fetchCompliance = useCallback(async () => {
    try {
      const res = await fetch('/api/leave/compliance/check')
      if (res.ok) {
        const result = await res.json()
        setData(result)
      }
    } catch (error) {
      console.error('[AnnualLeaveCompliancePanel] Error:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchCompliance()
  }, [fetchCompliance])

  if (loading || !data || dismissed) {
    return null
  }

  const { compliance, reminders, escalations } = data

  return (
    <div className="space-y-3">
      {/* Annual Leave Reminder Banner */}
      {compliance.isAnnualLeaveReminder && !compliance.isLocked && (
        <Alert className="border-amber-400 bg-amber-50 shadow-sm">
          <Clock className="h-5 w-5 text-amber-600" />
          <AlertTitle className="text-amber-900 font-semibold">
            📅 Annual Leave Submission Deadline: {data.daysLeft} day{data.daysLeft !== 1 ? 's' : ''} left
          </AlertTitle>
          <AlertDescription className="text-amber-800 mt-2">
            <p className="mb-3">
              You have until <strong>1st September</strong> to submit your annual leave plan for the {new Date().getFullYear()}/{new Date().getFullYear() + 1} year.
            </p>
            <p className="mb-3 text-sm">
              🔔 Your leave payment processing depends on submitting an approved leave plan. Submit now to ensure timely processing.
            </p>
            <div className="flex gap-2">
              <Link href="/dashboard/leave-management">
                <Button size="sm" className="bg-amber-600 hover:bg-amber-700">
                  Submit Leave Plan Now
                </Button>
              </Link>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setDismissed(true)}
              >
                Dismiss
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Annual Leave Locked Banner */}
      {compliance.isLocked && (
        <Alert className="border-red-300 bg-red-50">
          <Lock className="h-5 w-5 text-red-600" />
          <AlertTitle className="text-red-900 font-semibold">
            🔒 Annual Leave Planning is Locked
          </AlertTitle>
          <AlertDescription className="text-red-800 text-sm mt-2">
            Annual leave submission closed on 1st September. You cannot modify leave plans for this year. 
            Planning will re-open on 1st January for the next year.
          </AlertDescription>
        </Alert>
      )}

      {/* Leave Grant Awareness */}
      {compliance.shouldShowGrantAwareness && (
        <Card className="border-blue-200 bg-blue-50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Info className="h-5 w-5 text-blue-600" />
              Leave Payment Grant Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <strong>QCC Leave Grant:</strong> Your annual leave payment is processed through COCOBOD's leave grant scheme. 
              Payment depends on timely submission and approval of your leave plan.
            </p>
            <p>
              <strong>Processing Timeline:</strong> Approved leave plans are processed during your leave period or shortly after completion.
              Ensure you submit early to avoid delays in payment.
            </p>
            <p className="text-blue-700 font-medium">
              ✅ Submit your leave plan now to secure payment processing.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Manager/HOD Endorsement Escalations */}
      {escalations.length > 0 && (
        <Alert className="border-red-200 bg-red-50/90 py-2.5 shadow-sm">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <AlertTitle className="text-red-900 text-sm font-semibold">
            {escalations.length} overdue endorsement{escalations.length > 1 ? 's' : ''}
          </AlertTitle>
          <AlertDescription className="text-red-800 mt-1 text-xs">
            <p className="mb-2">
              Pending leave decisions require your attention.
            </p>
            <div className="space-y-1.5 mb-2 max-h-32 overflow-y-auto">
              {escalations.map((escalation, idx) => (
                <div key={idx} className="bg-white p-2 rounded text-xs border border-red-200">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-semibold text-slate-900">{escalation.staff_name}</p>
                      <p className="text-slate-600">{escalation.leave_type} leave • {escalation.days_overdue} days overdue</p>
                      <p className="text-slate-500">{escalation.start_date} to {escalation.end_date}</p>
                    </div>
                    <Badge variant="destructive">Overdue</Badge>
                  </div>
                </div>
              ))}
            </div>
            <Button asChild size="sm" variant="destructive" className="h-7 px-2.5 text-xs">
              <Link href="/dashboard/leave-management?tab=pending-approvals">
                Review pending requests
              </Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Generic Reminders */}
      {reminders.map((reminder, idx) => (
        <Alert
          key={idx}
          className={
            reminder.severity === 'high'
              ? 'border-red-400 bg-red-50'
              : reminder.severity === 'medium'
                ? 'border-amber-400 bg-amber-50'
                : 'border-blue-400 bg-blue-50'
          }
        >
          {reminder.severity === 'high' && <AlertTriangle className="h-5 w-5 text-red-600" />}
          {reminder.severity === 'medium' && <Clock className="h-5 w-5 text-amber-600" />}
          {reminder.severity === 'low' && <Info className="h-5 w-5 text-blue-600" />}
          <AlertDescription className="text-sm">
            <p>{reminder.message}</p>
            {reminder.action_url && (
              <Link href={reminder.action_url}>
                <Button size="sm" className="mt-2">
                  {reminder.action_label || 'Take Action'}
                </Button>
              </Link>
            )}
          </AlertDescription>
        </Alert>
      ))}
    </div>
  )
}
