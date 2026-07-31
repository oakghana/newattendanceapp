'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { differenceInCalendarDays } from 'date-fns'

export function SimpleLeaveCountdownBadge() {
  const [badge, setBadge] = useState<{
    daysRemaining: number
    endDate: string
    color: string
    emoji: string
  } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let isMounted = true

    const fetchLeaveData = async () => {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user || !isMounted) return

        // Query approved leave directly
        const { data: leave, error } = await supabase
          .from('leave_plan_requests')
          .select('preferred_start_date, preferred_end_date, adjusted_start_date, adjusted_end_date')
          .eq('user_id', user.id)
          .eq('status', 'approved')
          .order('preferred_start_date', { ascending: false })
          .limit(1)
          .single()

        if (!isMounted) return

        if (error || !leave) {
          setLoading(false)
          return
        }

        const today = new Date()
        today.setHours(0, 0, 0, 0)

        const startDate = leave.adjusted_start_date 
          ? new Date(leave.adjusted_start_date)
          : new Date(leave.preferred_start_date)
        const endDate = leave.adjusted_end_date 
          ? new Date(leave.adjusted_end_date)
          : new Date(leave.preferred_end_date)

        // Check if on leave
        if (today >= startDate && today <= endDate) {
          const daysRemaining = Math.max(0, differenceInCalendarDays(endDate, today) + 1)
          
          let color = 'bg-blue-500'
          let emoji = '🏖️'
          
          if (daysRemaining > 5) {
            color = 'bg-blue-500'
            emoji = '🏖️'
          } else if (daysRemaining > 2) {
            color = 'bg-yellow-500'
            emoji = '📆'
          } else if (daysRemaining > 0) {
            color = 'bg-orange-500'
            emoji = '⏰'
          } else if (daysRemaining === 0) {
            color = 'bg-red-500'
            emoji = '🎉'
          }

          setBadge({
            daysRemaining,
            endDate: endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            color,
            emoji,
          })
        }
      } catch (error) {
        console.error('[v0] Error fetching leave data:', error)
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    fetchLeaveData()
    const interval = setInterval(fetchLeaveData, 60000)

    return () => {
      isMounted = false
      clearInterval(interval)
    }
  }, [])

  if (loading || !badge) return null

  return (
    <div className={`${badge.color} text-white px-3 py-2 rounded-lg text-sm font-semibold inline-flex items-center gap-2 shadow-md`}>
      <span>{badge.emoji}</span>
      <span>
        {badge.daysRemaining === 0 
          ? `Resume work today (${badge.endDate})` 
          : `${badge.daysRemaining}d left - Resume ${badge.endDate}`}
      </span>
    </div>
  )
}
