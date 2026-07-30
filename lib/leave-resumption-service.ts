import { createClient } from '@supabase/supabase-js'
import { differenceInDays, format } from 'date-fns'
import { sendNotification, sendEmail } from './notification-service'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

export interface LeaveResumptionRecord {
  id: string
  user_id: string
  leave_request_id: string
  leave_end_date: string
  resumption_date?: string
  first_check_in_date?: string
  status: 'pending' | 'resumed' | 'overdue' | 'warning_sent' | 'letter_sent' | 'memo_sent'
  days_overdue: number
}

/**
 * Track leave resumption when staff checks in after leave ends
 */
export async function trackLeaveResumption(userId: string, checkInDate: Date) {
  try {
    // Find pending leave records for this user that ended before today
    const { data: resumptionRecords, error: fetchError } = await supabase
      .from('leave_resumption_notifications')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .lt('leave_end_date', format(new Date(), 'yyyy-MM-dd'))
      .is('first_check_in_date', null)

    if (fetchError) {
      console.error('[v0] Error fetching leave resumption records:', fetchError)
      return
    }

    // Mark as resumed for each pending leave
    for (const record of resumptionRecords || []) {
      await markAsResumed(record.id, userId, checkInDate)
    }
  } catch (error) {
    console.error('[v0] Error tracking leave resumption:', error)
  }
}

/**
 * Mark leave as resumed and notify supervisors
 */
export async function markAsResumed(
  recordId: string,
  userId: string,
  checkInDate: Date
) {
  try {
    // Update record as resumed
    const { data: updatedRecord, error: updateError } = await supabase
      .from('leave_resumption_notifications')
      .update({
        status: 'resumed',
        first_check_in_date: format(checkInDate, 'yyyy-MM-dd'),
        resumption_date: format(checkInDate, 'yyyy-MM-dd'),
      })
      .eq('id', recordId)
      .select()
      .single()

    if (updateError) {
      console.error('[v0] Error updating leave resumption:', updateError)
      return
    }

    // Get staff details
    const { data: staffUser } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single()

    // Notify supervisors of return
    await notifySupervisorsOfResumption(staffUser, updatedRecord)

    // Generate and send resumption memo to HOD, HR Leave Office, and HR Executive
    await generateAndSendResumptionMemo(staffUser, updatedRecord, checkInDate)

    // Log audit trail
    await logAuditTrail(recordId, userId, 'resumed', 
      `Staff member ${staffUser?.full_name} resumed duty on ${format(checkInDate, 'dd MMM yyyy')}. Resumption memo generated and sent.`)
  } catch (error) {
    console.error('[v0] Error marking leave as resumed:', error)
  }
}

/**
 * Check for staff who haven't resumed duty and send escalation notifications
 */
export async function checkAndEscalateNonResumption() {
  try {
    const today = new Date()

    // Find all pending leave records
    const { data: pendingRecords, error: fetchError } = await supabase
      .from('leave_resumption_notifications')
      .select('*, user_profiles:user_id(full_name, email, department, supervisor_id)')
      .eq('status', 'pending')

    if (fetchError) {
      console.error('[v0] Error fetching pending records:', fetchError)
      return
    }

    for (const record of pendingRecords || []) {
      const daysOverdue = differenceInDays(today, new Date(record.leave_end_date))

      if (daysOverdue < 2) continue // Not yet overdue

      let escalationLevel: 'warning' | 'letter' | 'memo' | null = null

      if (daysOverdue >= 10 && record.status !== 'memo_sent') {
        escalationLevel = 'memo'
      } else if (daysOverdue >= 5 && record.status !== 'letter_sent' && record.status !== 'memo_sent') {
        escalationLevel = 'letter'
      } else if (daysOverdue >= 2 && record.status !== 'warning_sent') {
        escalationLevel = 'warning'
      }

      if (escalationLevel) {
        await sendEscalationNotification(record, escalationLevel, daysOverdue)
      }
    }
  } catch (error) {
    console.error('[v0] Error checking non-resumption:', error)
  }
}

/**
 * Send escalation notification based on days overdue
 */
export async function sendEscalationNotification(
  record: any,
  level: 'warning' | 'letter' | 'memo',
  daysOverdue: number
) {
  try {
    const staffUser = record.user_profiles
    const statusMap = {
      warning: 'warning_sent',
      letter: 'letter_sent',
      memo: 'memo_sent',
    }

    // Get supervisors (HOD, RM, HR roles)
    const { data: supervisors } = await supabase
      .from('user_profiles')
      .select('*')
      .or(`id.eq.${staffUser.supervisor_id},role.in.("department_head","regional_manager","hr_executive","hr_leave_office","director_hr")`)

    if (level === 'warning') {
      await sendWarningNotification(staffUser, daysOverdue, supervisors)
    } else if (level === 'letter') {
      await sendWarningLetter(staffUser, daysOverdue, supervisors)
    } else if (level === 'memo') {
      await sendQueryMemo(staffUser, daysOverdue, supervisors)
    }

    // Update record status
    await supabase
      .from('leave_resumption_notifications')
      .update({
        status: statusMap[level],
        [`${level}_sent_at`]: new Date().toISOString(),
        days_overdue: daysOverdue,
      })
      .eq('id', record.id)

    // Log audit
    const eventMap = {
      warning: 'warning_2day',
      letter: 'warning_5day',
      memo: 'memo_10day',
    }
    await logAuditTrail(
      record.id,
      record.user_id,
      eventMap[level],
      `${level.charAt(0).toUpperCase() + level.slice(1)} notification sent (${daysOverdue} days overdue)`
    )
  } catch (error) {
    console.error('[v0] Error sending escalation notification:', error)
  }
}

/**
 * Send 2-day warning notification
 */
async function sendWarningNotification(
  staff: any,
  daysOverdue: number,
  supervisors: any[]
) {
  const message = `Staff member ${staff.full_name} from ${staff.department} has not resumed duty ${daysOverdue} days after their leave ended.`

  // Send to staff - dashboard alert
  await sendNotification({
    userId: staff.id,
    title: '⚠ Non-Resumption Warning',
    message: `You have not resumed duty for ${daysOverdue} days. Please check in immediately to avoid escalation.`,
    type: 'warning',
    severity: 'high',
  })

  // Send to supervisors
  for (const supervisor of supervisors || []) {
    await sendNotification({
      userId: supervisor.id,
      title: 'Non-Resumption Alert',
      message,
      type: 'alert',
      severity: 'medium',
    })
  }
}

/**
 * Send 5-day warning letter
 */
async function sendWarningLetter(
  staff: any,
  daysOverdue: number,
  supervisors: any[]
) {
  const letterHtml = generateWarningLetterHTML(staff, daysOverdue)

  // Send to staff - email
  await sendEmail({
    to: staff.email,
    subject: 'FORMAL WARNING - Non-Resumption of Duty',
    html: letterHtml,
    cc: supervisors?.map((s: any) => s.email).join(','),
  })

  // Send to supervisors
  for (const supervisor of supervisors || []) {
    await sendNotification({
      userId: supervisor.id,
      title: 'Warning Letter Issued',
      message: `Warning letter issued to ${staff.full_name} for non-resumption (${daysOverdue} days overdue)`,
      type: 'alert',
      severity: 'high',
    })
  }
}

/**
 * Send 10-day query memo for investigation
 */
async function sendQueryMemo(
  staff: any,
  daysOverdue: number,
  supervisors: any[]
) {
  const memoHtml = generateQueryMemoHTML(staff, daysOverdue)

  // Send to staff - email
  await sendEmail({
    to: staff.email,
    subject: 'QUERY MEMO - Investigation Required for Non-Resumption',
    html: memoHtml,
    cc: supervisors?.filter((s: any) => ['director_hr', 'hr_executive'].includes(s.role))
      .map((s: any) => s.email)
      .join(','),
  })

  // Notify HR Director and management
  const hrRoles = ['director_hr', 'hr_executive', 'department_head']
  for (const supervisor of supervisors?.filter((s: any) => hrRoles.includes(s.role)) || []) {
    await sendNotification({
      userId: supervisor.id,
      title: 'Query Memo Issued',
      message: `Query memo issued to ${staff.full_name} for investigation (${daysOverdue} days non-resumption). Disciplinary action pending.`,
      type: 'alert',
      severity: 'critical',
    })
  }
}

/**
 * Generate and send resumption memo via API
 */
async function generateAndSendResumptionMemo(
  staff: any,
  record: any,
  checkInDate: Date
) {
  try {
    // Call the resumption memo API to create memo and send notifications
    const memoPayload = {
      staffUserId: staff.id,
      leaveEndDate: record.leave_end_date,
      leaveType: record.leave_type || 'Annual Leave',
      notifyRoles: ['hod', 'hr_office', 'hr_executive'],
    }

    const response = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/leave/resumption-memo`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(memoPayload),
      }
    )

    if (!response.ok) {
      console.error('[v0] Failed to generate resumption memo:', await response.text())
      return
    }

    const memoResult = await response.json()
    console.log('[v0] Resumption memo generated:', memoResult.memo_id)

    // Send dashboard notification about memo
    await sendNotification({
      userId: staff.id,
      title: 'Return to Work Memo Generated',
      message: `Your return to work memo has been generated and is available for download. Reference: ${memoResult.memo_id}`,
      type: 'info',
      severity: 'medium',
    })
  } catch (error) {
    console.error('[v0] Error generating resumption memo:', error)
    // Don't block the resumption flow if memo generation fails
  }
}

/**
 * Notify supervisors of leave resumption
 */
async function notifySupervisorsOfResumption(staff: any, record: any) {
  // Get supervisors
  const { data: supervisors } = await supabase
    .from('user_profiles')
    .select('*')
    .or(`id.eq.${staff.supervisor_id},role.in.("department_head","regional_manager","hr_executive","hr_leave_office")`)

  const message = `${staff.full_name} from ${staff.department} has resumed duty on ${format(new Date(record.first_check_in_date), 'dd MMM yyyy')}`

  for (const supervisor of supervisors || []) {
    await sendNotification({
      userId: supervisor.id,
      title: 'Leave Resumption Notification',
      message,
      type: 'info',
      severity: 'low',
    })
  }
}

/**
 * Log audit trail for compliance
 */
async function logAuditTrail(
  recordId: string,
  userId: string,
  eventType: string,
  description: string
) {
  try {
    await supabase.from('leave_resumption_audit').insert({
      leave_resumption_id: recordId,
      user_id: userId,
      event_type: eventType,
      event_description: description,
    })
  } catch (error) {
    console.error('[v0] Error logging audit trail:', error)
  }
}

/**
 * Generate HTML for warning letter
 */
function generateWarningLetterHTML(staff: any, daysOverdue: number): string {
  const today = format(new Date(), 'dd MMMM yyyy')
  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: 'Arial', sans-serif; line-height: 1.6; color: #333; }
    .letter { max-width: 800px; margin: 0 auto; padding: 20px; }
    .header { text-align: center; margin-bottom: 30px; }
    .company-name { font-size: 18px; font-weight: bold; }
    .letterhead { font-size: 12px; color: #666; margin-top: 5px; }
    .content { margin: 20px 0; text-align: justify; }
    .recipient { margin: 20px 0; }
    .warning-box { 
      background-color: #ffe6e6; 
      border-left: 4px solid #cc0000; 
      padding: 15px; 
      margin: 20px 0;
      font-weight: bold;
    }
    .signature { margin-top: 40px; }
    .footer { margin-top: 30px; font-size: 11px; color: #666; border-top: 1px solid #ddd; padding-top: 10px; }
  </style>
</head>
<body>
  <div class="letter">
    <div class="header">
      <div class="company-name">QUALITY CONTROL COMPANY LIMITED (COCOBOD)</div>
      <div class="letterhead">Human Resources Department<br>FORMAL WARNING NOTICE</div>
    </div>

    <div class="recipient">
      <p><strong>Date:</strong> ${today}</p>
      <p><strong>To:</strong> ${staff.full_name}<br>
      <strong>Employee ID:</strong> ${staff.id}<br>
      <strong>Department:</strong> ${staff.department}</p>
    </div>

    <div class="warning-box">
      RE: FORMAL WARNING - NON-RESUMPTION OF DUTY AFTER LEAVE
    </div>

    <div class="content">
      <p>Dear ${staff.full_name},</p>

      <p>This letter serves as a formal warning regarding your failure to resume duty within the stipulated period following your approved leave. 
      Records show that you have not resumed work for <strong>${daysOverdue} (${daysOverdue}) days</strong> after your leave period ended.</p>

      <p><strong>Key Details:</strong></p>
      <ul>
        <li>Expected resumption date: As per your leave end date</li>
        <li>Current status: Not resumed</li>
        <li>Days overdue: ${daysOverdue} days</li>
      </ul>

      <p><strong>Required Action:</strong></p>
      <p>You are hereby required to:</p>
      <ol>
        <li>Resume duty immediately and check in through the Attendance System</li>
        <li>Provide written explanation for the delay within 48 hours</li>
        <li>Liaise with your department supervisor regarding any challenges</li>
      </ol>

      <p>Please note that continued non-resumption of duty may result in further disciplinary action, 
      including suspension or termination of employment, as per Company Policy and Ghana Labour Act provisions.</p>

      <p>If you are unable to resume duty due to medical or other valid reasons, please contact the HR Department immediately 
      with supporting documentation.</p>

      <p>Yours faithfully,</p>
    </div>

    <div class="signature">
      <p><strong>Human Resources Department</strong><br>
      Quality Control Company Limited</p>
    </div>

    <div class="footer">
      <p>This is an automated formal notice. For inquiries, contact HR Department at hr@cocobod.org</p>
    </div>
  </div>
</body>
</html>
  `
}

/**
 * Generate HTML for query memo
 */
function generateQueryMemoHTML(staff: any, daysOverdue: number): string {
  const today = format(new Date(), 'dd MMMM yyyy')
  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: 'Arial', sans-serif; line-height: 1.6; color: #333; }
    .memo { max-width: 900px; margin: 0 auto; padding: 20px; }
    .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #000; padding-bottom: 15px; }
    .company-name { font-size: 18px; font-weight: bold; }
    .letterhead { font-size: 12px; color: #000; margin-top: 5px; font-weight: bold; }
    .content { margin: 20px 0; text-align: justify; }
    .critical-box { 
      background-color: #ffcccc; 
      border: 2px solid #cc0000; 
      padding: 15px; 
      margin: 20px 0;
      font-weight: bold;
      text-align: center;
    }
    .footer { margin-top: 40px; font-size: 11px; color: #666; border-top: 1px solid #ddd; padding-top: 10px; }
    table { width: 100%; border-collapse: collapse; margin: 15px 0; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #f5f5f5; font-weight: bold; }
  </style>
</head>
<body>
  <div class="memo">
    <div class="header">
      <div class="company-name">QUALITY CONTROL COMPANY LIMITED (COCOBOD)</div>
      <div class="letterhead">QUERY MEMO FOR INVESTIGATION</div>
      <div class="letterhead">RE: NON-RESUMPTION OF DUTY</div>
    </div>

    <div class="critical-box">
      ⚠ CRITICAL: DISCIPLINARY INVESTIGATION IN PROGRESS
    </div>

    <table>
      <tr>
        <td><strong>Date Issued:</strong> ${today}</td>
        <td><strong>Employee Name:</strong> ${staff.full_name}</td>
      </tr>
      <tr>
        <td><strong>Employee ID:</strong> ${staff.id}</td>
        <td><strong>Department:</strong> ${staff.department}</td>
      </tr>
      <tr>
        <td colspan="2"><strong>Days Non-Resumption:</strong> ${daysOverdue} days (CRITICAL)</td>
      </tr>
    </table>

    <div class="content">
      <p>Dear ${staff.full_name},</p>

      <p>Following your continued non-resumption of duty after ${daysOverdue} days since the end of your approved leave period, 
      and in light of the Formal Warning Notice previously issued to you on this matter, this office is initiating a formal disciplinary 
      investigation into your conduct.</p>

      <p><strong>CHARGES UNDER INVESTIGATION:</strong></p>
      <ol>
        <li>Gross misconduct - Unauthorized absence from duty</li>
        <li>Violation of Employment Contract - Failure to resume work as stipulated</li>
        <li>Breach of Company Policy on Leave Management</li>
        <li>Potential violation of Ghana Labour Act provisions on Work Obligations</li>
      </ol>

      <p><strong>YOU ARE HEREBY REQUIRED TO:</strong></p>
      <ol>
        <li><strong>Resume duty immediately</strong> and check in through the Attendance System within 24 hours</li>
        <li><strong>Provide written statement</strong> explaining your absence within 48 hours of receiving this memo</li>
        <li><strong>Submit supporting documentation</strong> for any medical or emergency reasons (if applicable)</li>
        <li><strong>Attend formal hearing</strong> on date to be communicated separately</li>
      </ol>

      <p><strong>CONSEQUENCES OF NON-COMPLIANCE:</strong></p>
      <p>Failure to comply with this directive or continued non-resumption may result in:</p>
      <ul>
        <li>Immediate suspension from duty pending investigation outcome</li>
        <li>Termination of employment contract</li>
        <li>Referral to labour authorities for breach of Ghana Labour Act</li>
        <li>Recovery of any payments made during unauthorized absence</li>
      </ul>

      <p>This memo serves as formal notice that disciplinary action is in progress. Your cooperation is required for a fair investigation.</p>

      <p>Yours formally,</p>
    </div>

    <div style="margin-top: 40px;">
      <p><strong>Human Resources Director</strong><br>
      Quality Control Company Limited<br>
      ${today}</p>
    </div>

    <div class="footer">
      <p><strong>COPY TO:</strong> Department Head | Regional Manager | HR File | Employee Record</p>
      <p>This is an official disciplinary document. Unauthorized disclosure is prohibited.</p>
    </div>
  </div>
</body>
</html>
  `
}

export default {
  trackLeaveResumption,
  markAsResumed,
  checkAndEscalateNonResumption,
  sendEscalationNotification,
}
