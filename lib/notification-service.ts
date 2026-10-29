import { createClient } from '@supabase/supabase-js'
import { emailService } from './email-service'

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    throw new Error('Supabase environment variables are not configured')
  }

  return createClient(url, serviceRoleKey)
}

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
  module?: string
  recipientUserId?: string
  metadata?: Record<string, any>
}

/**
 * Send in-app notification to a user
 */
export async function sendNotification(options: NotificationOptions) {
  try {
    const { userId, title, message, type, severity = 'medium', actionUrl, data } = options

    // Get user details
    const { data: user } = await getSupabase()
      .from('user_profiles')
      .select('email')
      .eq('id', userId)
      .single()

    if (!user) {
      console.error('[v0] User not found for notification:', userId)
      return
    }

    // Create notification record in database using staff_notifications (live table)
    const { error } = await getSupabase().from('staff_notifications').insert({
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
    if (severity === 'high' || severity === 'critical' || actionUrl) {
      await sendEmail({
        to: user.email,
        subject: `${title} - Action Required`,
        html: generateNotificationEmailHTML(title, message, severity, actionUrl),
        module: inferModule(title, data),
        recipientUserId: userId,
        metadata: data,
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
    const { to, subject, html, cc, bcc, replyTo, module = 'system', recipientUserId, metadata } = options

    await emailService.sendEmail(
      to,
      {
        subject,
        html,
        text: html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
      },
      {
        emailModule: module,
        emailEvent: 'notification',
        recipientUserId,
        metadata: { ...metadata, cc, bcc, replyTo },
        idempotencyKey: `notification/${recipientUserId || to}/${subject}/${new Date().toISOString().slice(0, 16)}`,
      },
    )
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
    const { error } = await getSupabase()
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
function inferModule(title: string, data?: Record<string, any>): string {
  const hint = `${title} ${JSON.stringify(data || {})}`.toLowerCase()
  if (hint.includes('loan')) return 'loan'
  if (hint.includes('leave')) return 'leave'
  if (hint.includes('transport')) return 'transport'
  if (hint.includes('off-premises') || hint.includes('off premises')) return 'off_premises'
  if (hint.includes('account') || hint.includes('fd')) return 'accounts'
  return 'system'
}

function generateNotificationEmailHTML(
  title: string,
  message: string,
  severity: string,
  actionUrl?: string
): string {
  const severityColors = {
    low: '#3b82f6',
    medium: '#f59e0b',
    high: '#ef4444',
    critical: '#7f1d1d',
  }

  const color = severityColors[severity as keyof typeof severityColors] || '#0f766e'
  const portalUrl = actionUrl || process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || '#'
  const actionButton = actionUrl ? `<a href="${portalUrl}" style="display:inline-block;background:${color};color:#fff;padding:13px 24px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px">Open request in portal</a>` : ''

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
      <div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;opacity:.8">QCC National Service Portal</div>
      <h1>${title}</h1>
    </div>
    <div class="body">
      <div class="message">
        <p style="font-size:16px;color:#17333a">${message}</p>
      </div>
      <div style="background-color:#f0fdfa;padding:18px;border-radius:10px;margin-top:20px;border:1px solid #ccfbf1;">
        <p style="margin:0;color:#115e59"><strong>Action required:</strong> This request is waiting for your attention in the portal.</p>
      </div>
      <div style="margin-top:24px">${actionButton}</div>
      <div class="footer">
        <p>QCC MANAGEMENT</p>
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
