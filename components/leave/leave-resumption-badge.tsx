'use client'

import React, { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { AlertCircle, Calendar, Clock } from 'lucide-react'
import { calculateDaysRemaining } from '@/lib/leave-toast-utils'

interface LeaveResumptionBadgeProps {
  compact?: boolean
}

export function LeaveResumptionBadge({ compact = false }: LeaveResumptionBadgeProps) {
  const [daysRemaining, setDaysRemaining] = useState<number | null>(null)
  const [leaveEndDate, setLeaveEndDate] = useState<string | null>(null)
  const [isOnLeave, setIsOnLeave] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let isMounted = true

    const checkLeaveStatus = async () => {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user || !isMounted) return

        const { data: profile } = await supabase
          .from('user_profiles')
          .select('leave_status, leave_end_date, leave_start_date')
          .eq('id', user.id)
          .single()

        if (!isMounted) return

        if (profile?.leave_status === 'on_leave' && profile?.leave_end_date) {
          const days = calculateDaysRemaining(profile.leave_end_date)
          if (days <= 5) {
            setDaysRemaining(days)
            setLeaveEndDate(profile.leave_end_date)
            setIsOnLeave(true)
          }
        }
      } catch (error) {
        console.error('Error checking leave status:', error)
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    checkLeaveStatus()

    // Re-check every minute
    const interval = setInterval(checkLeaveStatus, 60000)

    return () => {
      isMounted = false
      clearInterval(interval)
    }
  }, [])

  if (loading || !isOnLeave || daysRemaining === null) return null

  const getUrgencyColor = (days: number) => {
    if (days <= 0) return 'bg-red-500 text-white'
    if (days === 1) return 'bg-orange-500 text-white'
    if (days <= 2) return 'bg-amber-500 text-white'
    return 'bg-blue-500 text-white'
  }

  const getUrgencyEmoji = (days: number) => {
    if (days <= 0) return '🔴'
    if (days === 1) return '🎉'
    if (days <= 2) return '⏰'
    return '📅'
  }

  const urgencyClass = getUrgencyColor(daysRemaining)
  const emoji = getUrgencyEmoji(daysRemaining)

  const formattedDate = leaveEndDate ? new Date(leaveEndDate).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric'
  }) : ''

  if (compact) {
    return (
      <Badge className={`${urgencyClass} px-2 py-1 text-xs font-semibold gap-1 flex items-center whitespace-nowrap`}>
        <span>{emoji}</span>
        <span>{daysRemaining === 0 ? 'Today' : `${daysRemaining}d`}</span>
      </Badge>
    )
  }

  return (
    <div className={`${urgencyClass} rounded-lg px-3 py-2 flex items-center gap-2 text-sm font-semibold`}>
      <div className="flex items-center gap-2">
        <span className="text-lg">{emoji}</span>
        <div className="flex flex-col">
          <span className="font-bold">
            {daysRemaining === 0 ? 'Resume Today!' : `Resume in ${daysRemaining} Day${daysRemaining > 1 ? 's' : ''}`}
          </span>
          <span className="text-xs opacity-90 flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {formattedDate}
          </span>
        </div>
      </div>
      <Clock className="w-4 h-4 ml-auto animate-pulse" />
    </div>
  )
}
