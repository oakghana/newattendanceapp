'use client'

import React, { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { Calendar, Clock, CheckCircle2 } from 'lucide-react'
import { differenceInCalendarDays } from 'date-fns'

interface LeaveResumptionBadgeProps {
  compact?: boolean
}

/**
 * Days until resumption from the leave end date.
 * end_date = Aug 03 means the user RESUMES on Aug 04 (the day after).
 * Returns positive = days still on leave, 0 = resume today, negative = overdue.
 */
function daysUntilResumption(endDateString: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const endDate = new Date(endDateString)
  endDate.setHours(0, 0, 0, 0)
  // Resume day is the day AFTER the leave end date
  const resumeDate = new Date(endDate)
  resumeDate.setDate(resumeDate.getDate() + 1)
  return differenceInCalendarDays(resumeDate, today)
}

export function LeaveResumptionBadge({ compact = false }: LeaveResumptionBadgeProps) {
  const [daysRemaining, setDaysRemaining] = useState<number | null>(null)
  const [leaveEndDate, setLeaveEndDate] = useState<string | null>(null)
  const [isOnLeave, setIsOnLeave] = useState(false)
  const [hasResumedToday, setHasResumedToday] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let isMounted = true

    const checkLeaveStatus = async () => {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user || !isMounted) return

        const today = new Date().toISOString().split('T')[0]

        const { data: attendanceToday } = await supabase
          .from('attendance_records')
          .select('id, check_in_time, check_out_time')
          .eq('user_id', user.id)
          .gte('check_in_time', `${today}T00:00:00`)
          .lt('check_in_time', `${today}T23:59:59`)
          .order('check_in_time', { ascending: false })
          .limit(1)
        const checkedIn = Boolean(attendanceToday?.[0]?.check_in_time)
        setHasResumedToday(checkedIn)

        // Query leave_plan_requests directly — user_profiles.leave_status is not
        // reliably updated when a leave is approved, so we check the source of truth.
        const { data: leaves } = await supabase
          .from('leave_plan_requests')
          .select('id, status, adjusted_end_date, preferred_end_date, adjusted_start_date, preferred_start_date')
          .eq('user_id', user.id)
          .in('status', ['approved', 'hr_approved', 'finalized', 'completed', 'memo_issued', 'on_leave'])
          .order('adjusted_end_date', { ascending: false })
          .limit(10)

        if (!isMounted) return

        const activeLeave = (leaves || []).find((leave) => {
          const startDate = leave.adjusted_start_date || leave.preferred_start_date
          const endDate = leave.adjusted_end_date || leave.preferred_end_date
          return Boolean(startDate && endDate && startDate <= today)
        })

        if (activeLeave) {
          const endDate = activeLeave.adjusted_end_date || activeLeave.preferred_end_date
          if (!endDate) {
            setIsOnLeave(false)
            return
          }
          const days = daysUntilResumption(endDate)

          // Show badge when 5 or fewer days until resumption (includes overdue / today / tomorrow)
          if (days <= 5) {
            setDaysRemaining(days)
            setLeaveEndDate(endDate)
            setIsOnLeave(true)
          } else {
            setIsOnLeave(false)
          }
        } else {
          setIsOnLeave(false)
        }
      } catch (error) {
        console.error('Error checking leave status for badge:', error)
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    checkLeaveStatus()

    const interval = setInterval(checkLeaveStatus, 60000)
    return () => {
      isMounted = false
      clearInterval(interval)
    }
  }, [])

  if (loading) return null

  if (hasResumedToday && isOnLeave) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-800">
        <CheckCircle2 className="h-4 w-4" />
        <div className="min-w-0">
          <p className="text-sm font-semibold">You have resumed work</p>
          <p className="text-xs text-emerald-700">Waiting for HOD/RM confirmation in management records.</p>
        </div>
      </div>
    )
  }

  if (!isOnLeave || daysRemaining === null) return null

  const getUrgencyColor = (days: number) => {
    if (days <= 0) return 'bg-red-600 text-white'
    if (days === 1) return 'bg-green-600 text-white'
    if (days === 2) return 'bg-orange-500 text-white'
    if (days <= 5) return 'bg-amber-500 text-white'
    return 'bg-blue-500 text-white'
  }

  const getResumptionText = (days: number) => {
    if (days <= 0) return `Resumption overdue by ${Math.abs(days)} day${Math.abs(days) !== 1 ? 's' : ''}`
    if (days === 1) return 'Resume Tomorrow'
    if (days === 2) return 'Resume in 2 Days'
    return `Resume in ${days} Days`
  }

  const formattedResumeDate = leaveEndDate
    ? (() => {
        const d = new Date(leaveEndDate)
        d.setDate(d.getDate() + 1)
        return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
      })()
    : ''

  const urgencyClass = getUrgencyColor(daysRemaining)

  if (compact) {
    return (
      <Badge className={`${urgencyClass} px-2 py-1 text-xs font-semibold flex items-center gap-1 whitespace-nowrap`}>
        <Clock className="w-3 h-3" />
        <span>{daysRemaining <= 0 ? 'Overdue' : daysRemaining === 1 ? 'Tomorrow' : `${daysRemaining}d`}</span>
      </Badge>
    )
  }

  return (
    <div className={`${urgencyClass} rounded-lg px-4 py-3 flex items-center gap-3`}>
      <Clock className="w-5 h-5 flex-shrink-0 animate-pulse" />
      <div className="flex flex-col min-w-0">
        <span className="font-bold text-sm leading-tight">{getResumptionText(daysRemaining)}</span>
        <span className="text-xs opacity-90 flex items-center gap-1 mt-0.5">
          <Calendar className="w-3 h-3 flex-shrink-0" />
          Resumption: {formattedResumeDate}
        </span>
      </div>
    </div>
  )
}
