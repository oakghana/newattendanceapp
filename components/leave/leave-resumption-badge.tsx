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
          // Show badge when 5 days OR LESS remain (including today and yesterday for past resumption)
          if (days <= 5) {
            setDaysRemaining(days)
            setLeaveEndDate(profile.leave_end_date)
            setIsOnLeave(true)
          }
        } else if (profile?.leave_status === 'resumption' && profile?.leave_end_date) {
          // Also show for users in "resumption" status (recently returned from leave)
          const days = calculateDaysRemaining(profile.leave_end_date)
          setDaysRemaining(0)
          setLeaveEndDate(profile.leave_end_date)
          setIsOnLeave(true)
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

  // Show badge if:
  // - Still on leave and resuming within 5 days
  // - Already past resumption (negative days, user forgot to update status)
  // - Currently on the resumption day (0 days)
  if (loading || !isOnLeave || daysRemaining === null || (daysRemaining > 5 && daysRemaining > 0)) {
    return null
  }

  const getUrgencyColor = (days: number) => {
    if (days < 0) return 'bg-red-600 text-white' // Past resumption date - urgent!
    if (days === 0) return 'bg-green-600 text-white' // Resumption today
    if (days === 1) return 'bg-orange-500 text-white'
    if (days <= 3) return 'bg-amber-500 text-white'
    return 'bg-blue-500 text-white'
  }

  const getUrgencyEmoji = (days: number) => {
    if (days < 0) return '🚨' // Past date alert
    if (days === 0) return '🎉' // Today!
    if (days === 1) return '⏰' // Tomorrow
    if (days <= 3) return '📅' // Soon
    return '📆' // A bit longer
  }

  const urgencyClass = getUrgencyColor(daysRemaining)
  const emoji = getUrgencyEmoji(daysRemaining)

  const formattedDate = leaveEndDate ? new Date(leaveEndDate).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }) : ''

  const getResumptionText = (days: number) => {
    if (days < 0) return `Should have resumed ${Math.abs(days)} day${Math.abs(days) > 1 ? 's' : ''} ago`
    if (days === 0) return 'Resume Today!'
    if (days === 1) return 'Resume Tomorrow'
    return `Resume in ${days} Day${days > 1 ? 's' : ''}`
  }

  if (compact) {
    return (
      <Badge className={`${urgencyClass} px-2 py-1 text-xs font-semibold gap-1 flex items-center whitespace-nowrap`}>
        <span>{emoji}</span>
        <span>{daysRemaining === 0 ? 'Today' : daysRemaining < 0 ? 'Overdue' : `${daysRemaining}d`}</span>
      </Badge>
    )
  }

  return (
    <div className={`${urgencyClass} rounded-lg px-3 py-2 flex items-center gap-2 text-sm font-semibold`}>
      <div className="flex items-center gap-2">
        <span className="text-lg">{emoji}</span>
        <div className="flex flex-col">
          <span className="font-bold">
            {getResumptionText(daysRemaining)}
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
