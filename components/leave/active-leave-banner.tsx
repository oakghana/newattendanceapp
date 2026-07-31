'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AlertCircle, Calendar, Clock } from 'lucide-react'
import { differenceInCalendarDays, format } from 'date-fns'

export function ActiveLeaveBanner() {
  const [activeLeave, setActiveLeave] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let isMounted = true

    const checkActiveLeave = async () => {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user || !isMounted) return

        const today = new Date()
        today.setHours(0, 0, 0, 0)

        // First, try to get approved leave from leave_plan_requests
        const { data: approvedLeaves } = await supabase
          .from('leave_plan_requests')
          .select('preferred_start_date, preferred_end_date, adjusted_start_date, adjusted_end_date, reason, status')
          .eq('user_id', user.id)
          .eq('status', 'approved')
          .order('preferred_start_date', { ascending: false })
          .limit(1)
          .single()

        if (!isMounted) return

        if (approvedLeaves) {
          // Use adjusted dates if available, otherwise use preferred dates
          const startDate = approvedLeaves.adjusted_start_date 
            ? new Date(approvedLeaves.adjusted_start_date)
            : new Date(approvedLeaves.preferred_start_date)
          const endDate = approvedLeaves.adjusted_end_date 
            ? new Date(approvedLeaves.adjusted_end_date)
            : new Date(approvedLeaves.preferred_end_date)

          // Check if currently on leave
          if (today >= startDate && today <= endDate) {
            const daysRemaining = Math.max(0, differenceInCalendarDays(endDate, today) + 1)
            setActiveLeave({
              startDate,
              endDate,
              reason: approvedLeaves.reason,
              daysRemaining,
              isToday: daysRemaining === 0,
            })
            if (isMounted) setLoading(false)
            return
          }
        }

        // Fallback: check user_profiles
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('leave_start_date, leave_end_date, leave_reason')
          .eq('id', user.id)
          .single()

        if (!isMounted || !profile) {
          if (isMounted) setLoading(false)
          return
        }

        const startDate = profile.leave_start_date ? new Date(profile.leave_start_date) : null
        const endDate = profile.leave_end_date ? new Date(profile.leave_end_date) : null

        // Check if currently on leave
        if (startDate && endDate && today >= startDate && today <= endDate) {
          const daysRemaining = Math.max(0, differenceInCalendarDays(endDate, today) + 1)
          setActiveLeave({
            startDate,
            endDate,
            reason: profile.leave_reason,
            daysRemaining,
            isToday: daysRemaining === 0,
          })
        }
      } catch (error) {
        console.error('[v0] Error checking active leave:', error)
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    checkActiveLeave()
    const interval = setInterval(checkActiveLeave, 60000) // Check every minute

    return () => {
      isMounted = false
      clearInterval(interval)
    }
  }, [])

  if (loading || !activeLeave) return null

  const getUrgencyColor = (daysRemaining: number) => {
    if (daysRemaining === 0) return 'bg-red-50 border-red-300'
    if (daysRemaining <= 1) return 'bg-orange-50 border-orange-300'
    if (daysRemaining <= 3) return 'bg-amber-50 border-amber-300'
    return 'bg-blue-50 border-blue-300'
  }

  const getUrgencyIcon = (daysRemaining: number) => {
    if (daysRemaining === 0) return 'text-red-600'
    if (daysRemaining <= 1) return 'text-orange-600'
    if (daysRemaining <= 3) return 'text-amber-600'
    return 'text-blue-600'
  }

  const getUrgencyBadgeColor = (daysRemaining: number) => {
    if (daysRemaining === 0) return 'bg-red-100 text-red-800'
    if (daysRemaining <= 1) return 'bg-orange-100 text-orange-800'
    if (daysRemaining <= 3) return 'bg-amber-100 text-amber-800'
    return 'bg-blue-100 text-blue-800'
  }

  return (
    <Card className={`border-2 ${getUrgencyColor(activeLeave.daysRemaining)} shadow-md`}>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 flex-1">
            <AlertCircle className={`h-5 w-5 mt-0.5 flex-shrink-0 ${getUrgencyIcon(activeLeave.daysRemaining)}`} />
            <div className="flex-1">
              <h3 className="font-semibold text-lg">
                {activeLeave.isToday
                  ? '🎉 Your Last Day on Leave - Resuming Work Today'
                  : `🏖️ Currently on Leave`}
              </h3>
              {activeLeave.reason && (
                <p className="text-sm text-muted-foreground mt-1">
                  Reason: {activeLeave.reason}
                </p>
              )}
              <div className="flex flex-wrap gap-4 mt-3">
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">
                    {format(activeLeave.startDate, 'MMM dd, yyyy')} - {format(activeLeave.endDate, 'MMM dd, yyyy')}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">
                    {activeLeave.daysRemaining === 0
                      ? 'Last day'
                      : `${activeLeave.daysRemaining} day${activeLeave.daysRemaining !== 1 ? 's' : ''} remaining`}
                  </span>
                </div>
              </div>
            </div>
          </div>
          <Badge className={getUrgencyBadgeColor(activeLeave.daysRemaining)}>
            {activeLeave.daysRemaining === 0 ? '⏰ TODAY' : `${activeLeave.daysRemaining}d left`}
          </Badge>
        </div>
      </CardContent>
    </Card>
  )
}
