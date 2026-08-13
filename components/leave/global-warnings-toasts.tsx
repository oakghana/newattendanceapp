'use client'

import React, { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { AlertTriangle, AlertCircle, Mail, X, ClipboardCheck } from 'lucide-react'
import { useLocalStorage } from '@/hooks/use-local-storage'

interface ManagementNotice {
  id: string
  staff_name: string
  resumption_date: string
  state: 'upcoming' | 'due_today' | 'overdue'
  days_until_resumption: number
  staff_checked_in: boolean
}

interface Warning {
  id: string
  type: 'warning' | 'query_memo' | 'info' | 'resumption_notice'
  title: string
  message: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  icon?: React.ReactNode
  dismissible?: boolean
}

export function GlobalWarningsToasts() {
  const [warnings, setWarnings] = useState<Warning[]>([])
  const [dismissedWarnings, setDismissedWarnings] = useLocalStorage<string[]>('dismissed-warnings', [])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let isMounted = true

    const loadWarnings = async () => {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user || !isMounted) return

        const managementResponse = await fetch('/api/leave/resumption-notices', { cache: 'no-store' })
        const managementPayload = managementResponse.ok ? await managementResponse.json() : { notices: [] }
        const managementNotices: ManagementNotice[] = Array.isArray(managementPayload.notices) ? managementPayload.notices : []

        // A live attendance session is the employee's evidence of resumption.
        // Do not show a non-resumption warning after they have checked in.
        const today = new Date().toISOString().split('T')[0]
        const { data: attendanceToday } = await supabase
          .from('attendance_records')
          .select('id, check_in_time, check_out_time')
          .eq('user_id', user.id)
          .gte('check_in_time', `${today}T00:00:00`)
          .lt('check_in_time', `${today}T23:59:59`)
          .order('check_in_time', { ascending: false })
          .limit(1)
        const hasCheckedInToday = Boolean(attendanceToday?.[0]?.check_in_time)

        // Fetch active non-resumption records for either a warning or a
        // post-check-in confirmation message.
        const { data: nonResumptionData } = await supabase
          .from('leave_non_resumption_tracking')
          .select('id, staff_id, days_overdue, status, created_at, first_check_in_date, confirmation_status')
          .eq('staff_id', user.id)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(5)

        // Fetch query memos
        const { data: queryMemoData } = await supabase
          .from('leave_query_memos')
          .select('id, staff_id, memo_type, issued_date, status')
          .eq('staff_id', user.id)
          .eq('status', 'pending')
          .order('issued_date', { ascending: false })
          .limit(3)

        if (!isMounted) return

        const allWarnings: Warning[] = []

        managementNotices.forEach((notice) => {
          const timing = notice.state === 'overdue'
            ? `overdue by ${Math.abs(notice.days_until_resumption)} day${Math.abs(notice.days_until_resumption) === 1 ? '' : 's'}`
            : notice.state === 'due_today' ? 'due today' : `due in ${notice.days_until_resumption} day${notice.days_until_resumption === 1 ? '' : 's'}`
          allWarnings.push({
            id: `resumption-notice-${notice.id}`,
            type: 'resumption_notice',
            title: notice.state === 'overdue' ? 'Resumption confirmation overdue' : 'Resumption confirmation required',
            message: `${notice.staff_name} is ${timing}. ${notice.staff_checked_in ? 'Staff check-in is recorded, but' : 'Please ensure'} HOD/RM confirmation is still required.`,
            severity: notice.state === 'overdue' ? 'high' : 'medium',
            dismissible: false,
          })
        })

        // A check-in changes the employee-facing state to resumed, while
        // management confirmation remains pending.
        if (hasCheckedInToday && nonResumptionData?.some((item) => item.confirmation_status === 'pending_hod_rm' || item.first_check_in_date)) {
          allWarnings.push({
            id: 'resumption-confirmation-pending',
            type: 'info',
            title: 'You have resumed work',
            message: 'Your attendance check-in was recorded. HOD/RM confirmation is pending for management records.',
            severity: 'low',
            dismissible: true,
          })
        }

        // Add non-resumption warnings only when the employee has not checked in.
        if (!hasCheckedInToday && nonResumptionData && nonResumptionData.length > 0) {
          nonResumptionData
            .filter((item) => !item.first_check_in_date && item.confirmation_status !== 'pending_hod_rm')
            .forEach((item) => {
            const daysOverdue = item.days_overdue || 0
            let severity: 'low' | 'medium' | 'high' | 'critical' = 'medium'
            let title = 'Non-Resumption Warning'
            let emoji = '⚠️'

            if (daysOverdue >= 10) {
              severity = 'critical'
              title = '🚨 CRITICAL: Investigation Required'
              emoji = '🔴'
            } else if (daysOverdue >= 5) {
              severity = 'high'
              title = '📨 Formal Warning Letter Issued'
              emoji = '📧'
            } else if (daysOverdue >= 2) {
              severity = 'high'
              title = '⚠️ You Have Not Resumed Duty'
              emoji = '⚠️'
            }

            allWarnings.push({
              id: `non-resumption-${item.id}`,
              type: 'warning',
              title: `${emoji} ${title}`,
              message: `You have been absent for ${daysOverdue} day${daysOverdue !== 1 ? 's' : ''} after your leave ended. Please check in immediately to avoid further escalation.`,
              severity,
              dismissible: true
            })
          })
        }

        // Add query memos
        if (queryMemoData && queryMemoData.length > 0) {
          queryMemoData.forEach((item) => {
            allWarnings.push({
              id: `query-memo-${item.id}`,
              type: 'query_memo',
              title: `📋 Query Memo - Action Required`,
              message: 'You have received a query memo regarding your leave/attendance. Please check the memo and respond within the required timeframe.',
              severity: 'critical',
              dismissible: false
            })
          })
        }

        setWarnings(allWarnings.filter(w => !dismissedWarnings.includes(w.id)))
      } catch (error) {
        console.error('Error loading warnings:', error)
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    loadWarnings()

    // Re-check every 5 minutes
    const interval = setInterval(loadWarnings, 300000)

    return () => {
      isMounted = false
      clearInterval(interval)
    }
  }, [dismissedWarnings])

  const dismissWarning = (warningId: string) => {
    setDismissedWarnings([...dismissedWarnings, warningId])
    setWarnings(warnings.filter(w => w.id !== warningId))
  }

  if (loading || warnings.length === 0) return null

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed inset-x-4 bottom-4 z-[110] flex max-h-[min(28rem,calc(100vh-2rem))] flex-col items-stretch gap-3 overflow-y-auto sm:left-auto sm:right-4 sm:w-[min(32rem,calc(100vw-2rem))]"
    >
      {warnings.map((warning) => (
        <Alert
          key={warning.id}
          role={warning.severity === 'critical' ? 'alert' : 'status'}
          className={`pointer-events-auto w-full shrink-0 border-l-4 p-4 pr-10 shadow-xl animate-in slide-in-from-bottom-2 ${
            warning.severity === 'critical'
              ? 'bg-red-50 dark:bg-red-950 border-red-500'
              : warning.severity === 'high'
                ? 'bg-orange-50 dark:bg-orange-950 border-orange-500'
                : 'bg-amber-50 dark:bg-amber-950 border-amber-500'
          }`}
        >
          <div className="flex items-start gap-3">
            <div>
              {warning.severity === 'critical' && (
                <AlertTriangle className={`h-5 w-5 ${warning.severity === 'critical' ? 'text-red-600 dark:text-red-400' : 'text-orange-600 dark:text-orange-400'}`} />
              )}
              {warning.severity === 'high' && (
                <AlertCircle className="h-5 w-5 text-orange-600 dark:text-orange-400" />
              )}
              {warning.severity === 'medium' && (
                <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              )}
            </div>
            <div className="flex-1">
              <AlertTitle className={`text-base font-bold leading-6 ${
                warning.severity === 'critical'
                  ? 'text-red-900 dark:text-red-100'
                  : warning.severity === 'high'
                    ? 'text-orange-900 dark:text-orange-100'
                    : 'text-amber-900 dark:text-amber-100'
              }`}>
                {warning.title}
              </AlertTitle>
              <AlertDescription className={`text-sm leading-6 ${
                warning.severity === 'critical'
                  ? 'text-red-800 dark:text-red-200 mt-1'
                  : warning.severity === 'high'
                    ? 'text-orange-800 dark:text-orange-200 mt-1'
                    : 'text-amber-800 dark:text-amber-200 mt-1'
              }`}>
                {warning.message}
              </AlertDescription>
              <div className="flex gap-2 mt-3">
                {warning.type === 'query_memo' && (
                  <Button size="sm" className="bg-blue-600 hover:bg-blue-700">
                    <Mail className="h-4 w-4 mr-1" />
                    View Memo
                  </Button>
                )}
                {warning.type === 'resumption_notice' && (
                  <Button size="sm" asChild className="bg-primary hover:bg-primary/90">
                    <a href="/dashboard/leave-management">
                      <ClipboardCheck className="h-4 w-4 mr-1" />
                      Confirm Resumption
                    </a>
                  </Button>
                )}
                {warning.dismissible && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => dismissWarning(warning.id)}
                    className="ml-auto"
                  >
                    Dismiss
                  </Button>
                )}
              </div>
            </div>
            {warning.dismissible && (
              <button
                onClick={() => dismissWarning(warning.id)}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </Alert>
      ))}
    </div>
  )
}
