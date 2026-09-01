import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { escalateOverdueEndorsements } from '@/lib/leave-compliance-service'
import { notifyStaffOfLeaveReminder, notifyManagerOfEscalation } from '@/lib/workflow-emails'
import { checkAndEscalateNonResumption } from '@/lib/leave-resumption-service'

/**
 * POST /api/leave/compliance/cron-daily-checks
 * 
 * This endpoint should be called by a cron job (e.g., GitHub Actions, external cron service)
 * once per day to:
 * 1. Send daily reminders to staff during the 14-day pre-Oct 1 period
 * 2. Escalate overdue manager endorsements and notify HR
 * 
 * Requires: Authorization header with secret token
 */
export async function POST(request: NextRequest) {
  try {
    // Verify cron job authorization
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET_TOKEN
    
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: 'Unauthorized: Invalid cron token' },
        { status: 401 }
      )
    }

    const admin = await createAdminClient()

    // ─── Step 1: Send annual leave reminders ───────────────────────────────
    const today = new Date()
    const currentYear = today.getFullYear()
    const octoberFirst = new Date(currentYear, 9, 1)
    octoberFirst.setHours(0, 0, 0, 0)
    
    const reminderStart = new Date(octoberFirst)
    reminderStart.setDate(reminderStart.getDate() - 14)
    
    const isReminderPeriod = today >= reminderStart && today < octoberFirst

    let remindersSent = 0
    if (isReminderPeriod) {
      // Get all staff who haven't submitted annual leave for current year
      const { data: staffNeedingReminder } = await admin
        .from('user_profiles')
        .select(`
          id,
          first_name,
          last_name,
          email,
          departments(name)
        `)
        .eq('is_active', true)
        .not('email', 'is', null)

      if (staffNeedingReminder) {
        for (const staff of staffNeedingReminder) {
          // Check if they've already submitted
          const { data: submitted } = await admin
            .from('leave_plan_requests')
            .select('id')
            .eq('user_id', staff.id)
            .eq('leave_type_key', 'annual')
            .eq('leave_year_period', `${currentYear}/${currentYear + 1}`)
            .in('status', ['pending_hod_review', 'hod_approved', 'manager_confirmed', 'hr_approved'])
            .limit(1)

          // If not submitted, send reminder
          if (!submitted || submitted.length === 0) {
            const daysLeft = Math.ceil((octoberFirst.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
            
            try {
              await notifyStaffOfLeaveReminder({
                staffEmail: staff.email,
                staffName: `${staff.first_name} ${staff.last_name}`,
                daysLeft,
                leaveYearPeriod: `${currentYear}/${currentYear + 1}`,
              })
              remindersSent++
            } catch (error) {
              console.warn(`[compliance/cron] Failed to send reminder to ${staff.email}:`, error)
            }
          }
        }
      }
    }

    // ─── Step 2: Escalate overdue endorsements ────────────────────────────
    const escalationResult = await escalateOverdueEndorsements(admin)

    // Notify HR of escalations
    if (escalationResult.escalated > 0) {
      const { data: hrUsers } = await admin
        .from('user_profiles')
        .select('email, first_name, last_name')
        .in('role', ['hr_executive', 'director_hr', 'manager_hr'])
        .eq('is_active', true)
        .limit(5)

      if (hrUsers) {
        for (const hrUser of hrUsers) {
          try {
            await notifyManagerOfEscalation({
              managerEmail: hrUser.email,
              managerName: `${hrUser.first_name} ${hrUser.last_name}`,
              escalationCount: escalationResult.escalated,
              escalationType: 'manager_endorsement_overdue',
            })
          } catch (error) {
            console.warn(`[compliance/cron] Failed to notify HR ${hrUser.email}:`, error)
          }
        }
      }
    }

    // ─── Step 3: Escalate non-resumptions (2-day warning, 5-day letter, 10-day memo) ──
    // Checks leave_resumption_notifications for staff who haven't checked in
    // after their leave ended and notifies HOD, RM, HR Executive, HR Leave Office.
    let nonResumptionEscalated = 0
    try {
      await checkAndEscalateNonResumption()
      nonResumptionEscalated = 1 // function handles its own counting internally
    } catch (escalateErr) {
      console.warn('[cron-daily-checks] Non-resumption escalation failed (non-fatal):', escalateErr)
    }

    // ─── Step 4: Seed resumption tracking for any hr_approved leaves missing a record ──
    // Catches leaves approved before the tracking system was deployed.
    try {
      const today2 = new Date().toISOString().split('T')[0]
      const { data: untracked } = await admin
        .from('leave_plan_requests')
        .select('id, user_id, adjusted_end_date, preferred_end_date')
        .eq('status', 'hr_approved')
        .is('id', null) // placeholder — replaced below

      // Find hr_approved leaves with no matching resumption record
      const { data: approvedLeaves } = await admin
        .from('leave_plan_requests')
        .select('id, user_id, adjusted_end_date, preferred_end_date')
        .eq('status', 'hr_approved')
        .lte('adjusted_end_date', today2)

      for (const leave of approvedLeaves || []) {
        const { data: existing } = await admin
          .from('leave_resumption_notifications')
          .select('id')
          .eq('leave_request_id', leave.id)
          .maybeSingle()
        if (!existing) {
          const endDate = leave.adjusted_end_date || leave.preferred_end_date
          if (endDate) {
            await admin.from('leave_resumption_notifications').insert({
              user_id: leave.user_id,
              leave_request_id: leave.id,
              leave_end_date: endDate,
              status: 'pending',
              days_overdue: 0,
            }).catch(() => {})
          }
        }
      }
    } catch (seedErr) {
      console.warn('[cron-daily-checks] Resumption seed step failed (non-fatal):', seedErr)
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      actions: {
        reminders_sent: remindersSent,
        is_reminder_period: isReminderPeriod,
        endorsements_escalated: escalationResult.escalated,
        non_resumption_escalation_run: nonResumptionEscalated > 0,
      },
    })
  } catch (error) {
    console.error('[leave/compliance/cron-daily-checks] Error:', error)
    return NextResponse.json(
      { error: 'Failed to run compliance checks', details: String(error) },
      { status: 500 }
    )
  }
}
