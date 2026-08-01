/**
 * Leave Compliance Service
 * Handles:
 * - Annual leave 14-day pre-submission reminders
 * - Annual leave submission locking after deadline
 * - Leave grant awareness messaging
 * - HOD/Manager endorsement escalations
 */

import { createAdminClient } from '@/lib/supabase/server'
import { differenceInDays, startOfSeptember, subDays } from 'date-fns'

interface LeaveComplianceCheckResult {
  isAnnualLeaveReminder: boolean
  daysUntilDeadline: number
  isLocked: boolean
  shouldShowGrantAwareness: boolean
  pendingEndorsements: number
  escalationDue: boolean
}

/**
 * Check if today is within 14 days before September 1
 * (Annual leave submission period)
 */
export function isAnnualLeaveReminderPeriod(): boolean {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  
  const septemberFirst = startOfSeptember(today)
  const reminderStart = subDays(septemberFirst, 14)
  
  return today >= reminderStart && today < septemberFirst
}

/**
 * Calculate days remaining until annual leave submission deadline
 */
export function daysUntilAnnualLeaveDeadline(): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  
  const septemberFirst = startOfSeptember(today)
  const diff = differenceInDays(septemberFirst, today)
  
  return Math.max(0, diff)
}

/**
 * Check if annual leave submission is locked for current calendar year
 * (After Sept 1 or staff has already submitted)
 */
export async function isAnnualLeaveLocked(
  userId: string,
  admin: any
): Promise<boolean> {
  const today = new Date()
  const currentYear = today.getFullYear()
  
  // Check if past Sept 1
  const septemberFirst = new Date(currentYear, 8, 1) // Month is 0-indexed
  septemberFirst.setHours(0, 0, 0, 0)
  
  if (today >= septemberFirst) {
    return true
  }
  
  // Check if already submitted
  const { data: submitted } = await admin
    .from('leave_plan_requests')
    .select('id')
    .eq('user_id', userId)
    .eq('leave_type_key', 'annual')
    .eq('leave_year_period', `${currentYear}/${currentYear + 1}`)
    .in('status', ['pending_hod_review', 'hod_approved', 'manager_confirmed', 'hr_approved'])
    .limit(1)
  
  return (submitted && submitted.length > 0) ? true : false
}

/**
 * Get compliance check for a user
 */
export async function checkLeaveCompliance(
  userId: string,
  admin: any
): Promise<LeaveComplianceCheckResult> {
  const isReminder = isAnnualLeaveReminderPeriod()
  const daysLeft = daysUntilAnnualLeaveDeadline()
  const isLocked = await isAnnualLeaveLocked(userId, admin)
  
  // Count pending endorsements
  const { data: pendingReviews, error: reviewError } = await admin
    .from('leave_plan_reviews')
    .select('id')
    .eq('reviewer_id', userId)
    .eq('decision', 'pending')
    .limit(1)
  
  const pendingCount = (pendingReviews && !reviewError) ? pendingReviews.length : 0
  
  // Check for overdue endorsements (>7 days pending)
  const { data: overdueReviews } = await admin
    .from('leave_plan_reviews')
    .select('created_at')
    .eq('reviewer_id', userId)
    .eq('decision', 'pending')
    .lt('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
    .limit(1)
  
  const escalationDue = (overdueReviews && overdueReviews.length > 0) ? true : false
  
  return {
    isAnnualLeaveReminder: isReminder,
    daysUntilDeadline: daysLeft,
    isLocked,
    shouldShowGrantAwareness: isReminder && !isLocked,
    pendingEndorsements: pendingCount,
    escalationDue,
  }
}

/**
 * Get annual leave reminders for staff who haven't submitted yet
 * Called during login or dashboard load
 */
export async function getAnnualLeaveReminders(userId: string, admin: any) {
  if (!isAnnualLeaveReminderPeriod()) {
    return { reminders: [], daysLeft: daysUntilAnnualLeaveDeadline() }
  }
  
  const isLocked = await isAnnualLeaveLocked(userId, admin)
  const daysLeft = daysUntilAnnualLeaveDeadline()
  
  // If already locked or submitted, no reminder needed
  if (isLocked) {
    return { reminders: [], daysLeft: 0 }
  }
  
  // Return reminder for staff
  return {
    reminders: [{
      type: 'annual_leave_deadline',
      message: `📅 You have ${daysLeft} day${daysLeft !== 1 ? 's' : ''} left to submit your Annual Leave Plan for the ${new Date().getFullYear()}/${new Date().getFullYear() + 1} year. Submissions close on 1st September.`,
      severity: daysLeft <= 3 ? 'high' : daysLeft <= 7 ? 'medium' : 'low',
      action_url: '/dashboard/leave-management',
      action_label: 'Submit Now',
      created_at: new Date().toISOString(),
    }],
    daysLeft,
  }
}

/**
 * Get endorsement escalation warnings for managers
 */
export async function getEndorsementEscalations(userId: string, admin: any) {
  const { data: overdueReviews, error } = await admin
    .from('leave_plan_reviews')
    .select(`
      id,
      created_at,
      leave_plan_request:leave_plan_requests!leave_plan_reviews_leave_plan_request_id_fkey (
        id,
        user_id,
        user:user_profiles!leave_plan_requests_user_id_fkey (
          first_name,
          last_name,
          employee_id
        ),
        leave_type_key,
        preferred_start_date,
        preferred_end_date,
        requested_days
      )
    `)
    .eq('reviewer_id', userId)
    .eq('decision', 'pending')
    .lt('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
    .order('created_at', { ascending: true })
  
  if (error || !overdueReviews) {
    return { escalations: [] }
  }
  
  return {
    escalations: overdueReviews.map((review: any) => {
      const req = review.leave_plan_request
      const daysOverdue = Math.floor((Date.now() - new Date(review.created_at).getTime()) / (1000 * 60 * 60 * 24))
      
      return {
        review_id: review.id,
        staff_name: `${req.user?.first_name} ${req.user?.last_name}`,
        employee_id: req.user?.employee_id,
        leave_type: req.leave_type_key,
        start_date: req.preferred_start_date,
        end_date: req.preferred_end_date,
        days_overdue: daysOverdue,
        message: `⚠️ Pending leave review for ${req.user?.first_name} ${req.user?.last_name} (${daysOverdue} days overdue) - please endorse or reject.`,
        request_id: req.id,
      }
    }),
  }
}

/**
 * Automatically escalate overdue endorsements to HR Leave Office
 */
export async function escalateOverdueEndorsements(admin: any) {
  const { data: overdueReviews } = await admin
    .from('leave_plan_reviews')
    .select(`
      id,
      reviewer_id,
      leave_plan_request_id,
      created_at,
      leave_plan_request:leave_plan_requests!leave_plan_reviews_leave_plan_request_id_fkey (
        user_id,
        status,
        leave_type_key,
        preferred_start_date,
        preferred_end_date
      )
    `)
    .eq('decision', 'pending')
    .lt('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
  
  if (!overdueReviews || overdueReviews.length === 0) {
    return { escalated: 0 }
  }
  
  // Create escalation audit log for each overdue review
  const escalationLogs = overdueReviews.map((review: any) => ({
    action: 'endorsement_escalation',
    table_name: 'leave_plan_reviews',
    record_id: review.id,
    details: {
      reviewer_id: review.reviewer_id,
      leave_request_id: review.leave_plan_request_id,
      leave_type: review.leave_plan_request.leave_type_key,
      days_overdue: Math.floor((Date.now() - new Date(review.created_at).getTime()) / (1000 * 60 * 60 * 24)),
      escalation_timestamp: new Date().toISOString(),
      leave_dates: `${review.leave_plan_request.preferred_start_date} to ${review.leave_plan_request.preferred_end_date}`,
    },
    created_at: new Date().toISOString(),
  }))
  
  // Log all escalations
  const { error: logError } = await admin
    .from('audit_logs')
    .insert(escalationLogs)
  
  if (logError) {
    console.error('[leave-compliance] Escalation logging error:', logError)
  }
  
  return { escalated: overdueReviews.length }
}
