"use client"

import { useEffect, useState } from "react"
import { X, Calendar, Clock, TrendingDown } from "lucide-react"
import { differenceInCalendarDays, format, isPast, isToday } from "date-fns"

interface LeaveCountdownToastProps {
  leaveStartDate: string
  leaveEndDate: string
  leaveType: string
  staffName: string
  onDismiss?: () => void
}

export function LeaveCountdownToast({
  leaveStartDate,
  leaveEndDate,
  leaveType,
  staffName,
  onDismiss,
}: LeaveCountdownToastProps) {
  const [daysRemaining, setDaysRemaining] = useState<number>(0)
  const [mounted, setMounted] = useState(false)
  const [dismissing, setDismissing] = useState(false)

  useEffect(() => {
    setMounted(true)
    
    const calculateDaysRemaining = () => {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const endDate = new Date(leaveEndDate)
      endDate.setHours(0, 0, 0, 0)
      
      const remaining = Math.max(0, differenceInCalendarDays(endDate, today) + 1)
      setDaysRemaining(remaining)
    }

    calculateDaysRemaining()
    
    // Update every minute
    const interval = setInterval(calculateDaysRemaining, 60000)
    return () => clearInterval(interval)
  }, [leaveEndDate])

  const endDate = new Date(leaveEndDate)
  const isEndingToday = isToday(endDate)
  const isOverdue = isPast(endDate)

  // Determine urgency level
  let urgency: "low" | "medium" | "high" | "critical" = "low"
  let bgColor = "bg-emerald-50 dark:bg-emerald-950/30"
  let borderColor = "border-emerald-200 dark:border-emerald-800"
  let textColor = "text-emerald-900 dark:text-emerald-100"
  let accentColor = "text-emerald-600 dark:text-emerald-400"
  let emoji = "🏖️"
  let title = `Enjoying Your ${leaveType}`

  if (isOverdue) {
    urgency = "critical"
    bgColor = "bg-red-50 dark:bg-red-950/30"
    borderColor = "border-red-200 dark:border-red-800"
    textColor = "text-red-900 dark:text-red-100"
    accentColor = "text-red-600 dark:text-red-400"
    emoji = "🔴"
    title = "Time to Check In"
  } else if (isEndingToday) {
    urgency = "critical"
    bgColor = "bg-orange-50 dark:bg-orange-950/30"
    borderColor = "border-orange-200 dark:border-orange-800"
    textColor = "text-orange-900 dark:text-orange-100"
    accentColor = "text-orange-600 dark:text-orange-400"
    emoji = "🎉"
    title = "Resume Work Today!"
  } else if (daysRemaining <= 2) {
    urgency = "high"
    bgColor = "bg-amber-50 dark:bg-amber-950/30"
    borderColor = "border-amber-200 dark:border-amber-800"
    textColor = "text-amber-900 dark:text-amber-100"
    accentColor = "text-amber-600 dark:text-amber-400"
    emoji = "⏰"
    title = "Leave Ending Soon"
  } else if (daysRemaining <= 5) {
    urgency = "medium"
    bgColor = "bg-sky-50 dark:bg-sky-950/30"
    borderColor = "border-sky-200 dark:border-sky-800"
    textColor = "text-sky-900 dark:text-sky-100"
    accentColor = "text-sky-600 dark:text-sky-400"
    emoji = "📅"
    title = "Leave in Progress"
  }

  if (!mounted) return null

  return (
    <div
      className={`fixed bottom-4 right-4 max-w-sm transform transition-all duration-300 ease-out ${
        dismissing ? "translate-x-full opacity-0" : "translate-x-0 opacity-100"
      }`}
      role="alert"
      aria-live="polite"
      aria-label={`Leave countdown: ${daysRemaining} days remaining`}
    >
      <div
        className={`border rounded-lg shadow-lg p-4 space-y-3 ${bgColor} ${borderColor}`}
      >
        {/* Header with close button */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3 flex-1">
            <div className="text-2xl shrink-0">{emoji}</div>
            <div className="flex-1 min-w-0">
              <h3 className={`font-semibold text-sm ${accentColor}`}>{title}</h3>
              <p className={`text-xs opacity-75 ${textColor}`}>Leave Management</p>
            </div>
          </div>
          <button
            onClick={() => {
              setDismissing(true)
              setTimeout(() => onDismiss?.(), 300)
            }}
            className={`p-1 hover:bg-white/30 rounded-md transition-colors shrink-0 ${accentColor}`}
            aria-label="Dismiss notification"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Main countdown section */}
        <div className={`rounded-lg bg-white/50 dark:bg-black/20 p-3 border border-white/50 dark:border-white/10`}>
          <div className="flex items-baseline justify-center gap-2">
            <span className={`text-4xl font-bold ${accentColor}`}>{daysRemaining}</span>
            <span className={`text-sm font-medium ${textColor} opacity-75`}>
              day{daysRemaining !== 1 ? "s" : ""} remaining
            </span>
          </div>
        </div>

        {/* Leave details */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className={`rounded px-2.5 py-2 bg-white/40 dark:bg-black/20 border ${borderColor}`}>
            <p className={`opacity-75 ${textColor} mb-0.5`}>Resume Date</p>
            <p className={`font-semibold ${accentColor}`}>{format(endDate, "dd MMM")}</p>
          </div>
          <div className={`rounded px-2.5 py-2 bg-white/40 dark:bg-black/20 border ${borderColor}`}>
            <p className={`opacity-75 ${textColor} mb-0.5`}>Leave Type</p>
            <p className={`font-semibold ${accentColor} truncate`}>{leaveType}</p>
          </div>
        </div>

        {/* Personalized message */}
        <div className={`text-xs ${textColor} opacity-80 italic bg-white/30 dark:bg-black/20 rounded px-2.5 py-2 border ${borderColor}`}>
          {isOverdue
            ? "Your leave has ended. Please check in to mark your attendance."
            : isEndingToday
              ? `Welcome back tomorrow! Make sure to check in when you resume duties.`
              : `You're set for ${leaveType}. We'll be ready for your return!`}
        </div>
      </div>
    </div>
  )
}
