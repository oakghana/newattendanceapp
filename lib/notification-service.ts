import { createClient } from '@supabase/supabase-js'
import { emailService } from './email-service'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

export interface NotificationOptions {
  userId: string
  title: string
  message: string
  type: 'info' | 'warning' | 'alert' | 'success' | 'error'
  severity?: 'low' | 'medium' | 'high' | 'critical'
  actionUrl?: string
  data?: Record<string, any>
}

export interface EmailOptions {
  to: string
  subject: string
  html: string
  cc?: string
  bcc?: string
  replyTo?: string
}

/**
 * Send in-app notification to a user
 */
export async function sendNotification(options: NotificationOptions) {
  try {
    const { userId, title, message, type, severity = 'medium', actionUrl, data } = options

    // Get user details
    const { data: user } = await supabase
      .from('user_profiles')
      .select('email')
      .eq('id', userId)
      .single()

    if (!user) {
      console.error('[v0] User not found for notification:', userId)
      return
    }

    // Create notification record in database using staff_notifications (live table)
    const { error } = await supabase.from('staff_notifications').insert({
      recipient_id: userId,
      sender_id: userId,       // system notification — sender = self
      sender_role: 'system',
      sender_label: title,
      message,
      notification_type: type,
      is_read: false,
    })

    if (error) {
      console.error('[v0] Error creating notification:', error)
      return
    }

    // Optionally send email for high-priority notifications
    if (severity === 'high' || severity === 'critical') {
      await sendEmail({
        to: user.email,
        subject: `${title} - Action Required`,
        html: generateNotificationEmailHTML(title, message, severity),
      })
    }
  } catch (error) {
    console.error('[v0] Error sending notification:', error)
  }
}

/**
 * Send email notification
 */
export async function sendEmail(options: EmailOptions) {
  try {
    const { to, subject, html, cc, bcc, replyTo } = options

    // Use the email service to send
    await (emailService as any).sendEmail({
      to,
      subject,
      html,
      cc,
      bcc,
      replyTo,
    })
  } catch (error) {
    console.error('[v0] Error sending email:', error)
  }
}

/**
 * Create notification for dashboard display
 */
export async function createDashboardNotification(
  userId: string,
  type: string,
  title: string,
  message: string,
  severity: 'low' | 'medium' | 'high' | 'critical'
) {
  try {
    const { error } = await supabase
      .from('dashboard_notifications')
      .insert({
        user_id: userId,
        type,
        title,
        message,
        severity,
        is_active: true,
        created_at: new Date().toISOString(),
      })

    if (error) {
      console.error('[v0] Error creating dashboard notification:', error)
    }
  } catch (error) {
    console.error('[v0] Error:', error)
  }
}

/**
 * Generate HTML for notification emails
 */
function generateNotificationEmailHTML(
  title: string,
  message: string,
  severity: string
): string {
  const severityColors = {
    low: '#3b82f6',
    medium: '#f59e0b',
    high: '#ef4444',
    critical: '#7f1d1d',
  }

  const color = severityColors[severity as keyof typeof severityColors] || '#3b82f6'

  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: ${color}; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
    .header h1 { margin: 0; font-size: 24px; }
    .body { background-color: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; border: 1px solid #e5e7eb; border-top: none; }
    .message { margin: 15px 0; }
    .footer { margin-top: 20px; font-size: 12px; color: #666; border-top: 1px solid #e5e7eb; padding-top: 10px; }
    .button { 
      display: inline-block; 
      background-color: ${color}; 
      color: white; 
      padding: 10px 20px; 
      text-decoration: none; 
      border-radius: 5px; 
      margin-top: 15px; 
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${title}</h1>
    </div>
    <div class="body">
      <div class="message">
        <p>${message}</p>
      </div>
      <div style="background-color: white; padding: 15px; border-radius: 5px; margin-top: 20px;">
        <p><strong>Action Required:</strong> Please log into your account to view full details and take any necessary action.</p>
      </div>
      <div class="footer">
        <p>This is an automated notification from the Leave Management System. Please do not reply to this email.</p>
      </div>
    </div>
  </div>
</body>
</html>
  `
}

export default {
  sendNotification,
  sendEmail,
  createDashboardNotification,
}
