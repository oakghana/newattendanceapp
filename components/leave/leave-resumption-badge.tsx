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
          .select('leave_status, leave_end_date, leave_start_date, is_on_leave')
          .eq('id', user.id)
          .single()

        if (!isMounted) return

        // Check if user is on leave - either via leave_status or is_on_leave flag or by date range
        if (profile?.leave_end_date) {
          const today = new Date()
          const endDate = new Date(profile.leave_end_date)
          const startDate = profile.leave_start_date ? new Date(profile.leave_start_date) : null
          
          // User is on leave if:
          // 1. leave_status is explicitly 'on_leave' OR
          // 2. is_on_leave flag is true OR
          // 3. Today is between start and end date
          const isOnLeaveByStatus = profile?.leave_status === 'on_leave' || profile?.is_on_leave
          const isOnLeaveByDate = startDate ? (today >= startDate && today <= endDate) : (today <= endDate)
          
          if (isOnLeaveByStatus || isOnLeaveByDate) {
            const days = calculateDaysRemaining(profile.leave_end_date)
            setDaysRemaining(days)
            setLeaveEndDate(profile.leave_end_date)
            setIsOnLeave(true)
          }
        }
      } catch (error) {
        console.error('[v0] Error checking leave status:', error)
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    checkLeaveStatus()

    // Re-check every minute to keep countdown updated
    const interval = setInterval(checkLeaveStatus, 60000)

    return () => {
      isMounted = false
      clearInterval(interval)
    }
  }, [])

  // Only return null if loading is true. Show badge if isOnLeave is true, even if daysRemaining is 0 or negative
  if (loading) return null
  if (!isOnLeave) return null
  if (daysRemaining === null) return null

  const getUrgencyColor = (days: number) => {
    if (days < 0) return 'bg-red-600 text-white' // Overdue - dark red
    if (days === 0) return 'bg-red-500 text-white' // Today
    if (days === 1) return 'bg-orange-500 text-white' // Tomorrow
    if (days <= 3) return 'bg-amber-500 text-white' // Next few days
    if (days <= 5) return 'bg-yellow-500 text-white' // Within a week
    return 'bg-blue-500 text-white' // More than a week
  }

  const getUrgencyEmoji = (days: number) => {
    if (days < 0) return '⛔' // Overdue
    if (days === 0) return '🎉' // Today
    if (days === 1) return '⏰' // Tomorrow
    if (days <= 3) return '📅' // Soon
    if (days <= 5) return '📆' // Within week
    return '🏖️' // Plenty of time
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
