import { differenceInCalendarDays, isToday, isPast } from "date-fns"

export interface LeaveToastConfig {
  daysRemaining: number
  isEndingToday: boolean
  isOverdue: boolean
  urgencyLevel: "low" | "medium" | "high" | "critical"
}

/**
 * Calculate days remaining from end date
 */
export function calculateDaysRemaining(endDateString: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const endDate = new Date(endDateString)
  endDate.setHours(0, 0, 0, 0)
  // Do NOT clamp to 0 — callers need the sign to detect overdue cases
  return differenceInCalendarDays(endDate, today) + 1
}

/**
 * Get urgency level based on days remaining
 */
export function getToastUrgency(
  daysRemaining: number,
  isEndingToday: boolean,
  isOverdue: boolean
): "low" | "medium" | "high" | "critical" {
  if (isOverdue || isEndingToday) return "critical"
  if (daysRemaining <= 2) return "high"
  if (daysRemaining <= 5) return "medium"
  return "low"
}

/**
 * Get personalized toast message
 */
export function getToastMessage(
  leaveType: string,
  daysRemaining: number,
  isEndingToday: boolean,
  isOverdue: boolean
): { title: string; emoji: string; message: string } {
  if (isOverdue) {
    return {
      emoji: "🔴",
      title: "Time to Check In",
      message: "Your leave has ended. Please check in to mark your attendance.",
    }
  }

  if (isEndingToday) {
    return {
      emoji: "🎉",
      title: "Resume Work Today!",
      message: "Welcome back! Make sure to check in when you resume duties.",
    }
  }

  if (daysRemaining <= 2) {
    return {
      emoji: "⏰",
      title: "Leave Ending Soon",
      message: `Your ${leaveType} is ending soon. Prepare to resume work!`,
    }
  }

  if (daysRemaining <= 5) {
    return {
      emoji: "📅",
      title: "Leave in Progress",
      message: `You're set for ${leaveType}. Enjoy the remaining days!`,
    }
  }

  return {
    emoji: "🏖️",
    title: `Enjoying Your ${leaveType}`,
    message: `You're set for ${leaveType}. We'll be ready for your return!`,
  }
}

/**
 * Check if staff should see the countdown toast
 */
export function shouldShowCountdownToast(
  leaveStatus: string | null,
  leaveStartDate: string | null,
  leaveEndDate: string | null
): boolean {
  // Only show for active leave
  if (leaveStatus !== "on_leave" && leaveStatus !== "sick_leave") {
    return false
  }

  // Must have valid dates
  if (!leaveStartDate || !leaveEndDate) {
    return false
  }

  // Only show if leave has started or is ongoing
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const startDate = new Date(leaveStartDate)
  startDate.setHours(0, 0, 0, 0)

  return today >= startDate
}

/**
 * Get color config based on urgency
 */
export function getToastColors(
  urgency: "low" | "medium" | "high" | "critical"
): {
  bg: string
  border: string
  text: string
  accent: string
} {
  const colorMap = {
    low: {
      bg: "bg-emerald-50 dark:bg-emerald-950/30",
      border: "border-emerald-200 dark:border-emerald-800",
      text: "text-emerald-900 dark:text-emerald-100",
      accent: "text-emerald-600 dark:text-emerald-400",
    },
    medium: {
      bg: "bg-sky-50 dark:bg-sky-950/30",
      border: "border-sky-200 dark:border-sky-800",
      text: "text-sky-900 dark:text-sky-100",
      accent: "text-sky-600 dark:text-sky-400",
    },
    high: {
      bg: "bg-amber-50 dark:bg-amber-950/30",
      border: "border-amber-200 dark:border-amber-800",
      text: "text-amber-900 dark:text-amber-100",
      accent: "text-amber-600 dark:text-amber-400",
    },
    critical: {
      bg: "bg-red-50 dark:bg-red-950/30",
      border: "border-red-200 dark:border-red-800",
      text: "text-red-900 dark:text-red-100",
      accent: "text-red-600 dark:text-red-400",
    },
  }

  return colorMap[urgency]
}
