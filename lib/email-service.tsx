import "server-only"
import nodemailer from "nodemailer"
import { createHash } from "node:crypto"
import { createAdminClient } from "@/lib/supabase/server"

interface EmailConfig {
  host: string
  port: number
  secure: boolean
  auth: {
    user: string
    pass: string
  }
}

interface EmailTemplate {
  subject: string
  html: string
  text: string
  cc?: string[]
  replyTo?: string
}

function wrapEmailWithWatermark(content: string): string {
  return `
    <div style="margin:0;background:#f4f7fb;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;color:#172554;">
      <div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #dbe5f0;border-radius:18px;overflow:hidden;box-shadow:0 8px 24px rgba(15,23,42,.08);">
        <div style="background:#2563eb;padding:30px 34px;color:#ffffff;">
          <div style="font-size:12px;letter-spacing:2px;font-weight:700;opacity:.85;">QCC ATTENDANCE</div>
          <div style="margin-top:12px;font-size:28px;line-height:1.15;font-weight:700;">{{emailHeading}}</div>
          <div style="margin-top:10px;font-size:15px;line-height:1.5;opacity:.9;">{{emailSubtitle}}</div>
        </div>
        <div style="padding:30px 34px;font-size:15px;line-height:1.6;">
          ${content}
        </div>
        <div style="border-top:1px solid #e2e8f0;padding:16px 34px;color:#64748b;font-size:12px;">QCC Attendance System · Automated notification</div>
      </div>
    </div>
  `
}

class EmailService {
  private transporter: nodemailer.Transporter | null = null
  private isConfigured = false
  private initializationPromise: Promise<void> | null = null
  private senderEmail = ""
  private senderName = "QCC Attendance System"
  private lastError: string | null = null

  private fromEnvironment(): EmailConfig | null {
    const user = String(process.env.SMTP_USER || "").trim()
    const pass = String(process.env.SMTP_PASS || "").trim()
    if (!user || !pass) return null

    return {
      host: String(process.env.SMTP_HOST || "smtp.gmail.com").trim() || "smtp.gmail.com",
      port: Number.parseInt(process.env.SMTP_PORT || "587"),
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user,
        pass,
      },
    }
  }

  private async fromDatabase(): Promise<(EmailConfig & { fromName?: string }) | null> {
    try {
      const adminClient = await createAdminClient()
      const { data } = await adminClient.from("system_settings").select("settings").eq("id", 1).maybeSingle()
      const settings = (data?.settings || {}) as Record<string, any>
      const smtp = (settings.smtp || {}) as Record<string, any>

      if (smtp.enabled === false) {
        return null
      }

      const user = String(smtp.user || "").trim()
      const pass = String(smtp.pass || "").trim()

      if (!user || !pass) {
        return null
      }

      return {
        host: String(smtp.host || "smtp.gmail.com").trim() || "smtp.gmail.com",
        port: Number.parseInt(String(smtp.port || "587"), 10),
        secure: String(smtp.secure) === "true" || smtp.secure === true,
        auth: {
          user,
          pass,
        },
        fromName: String(smtp.fromName || "QCC Attendance System").trim() || "QCC Attendance System",
      }
    } catch (error) {
      console.warn("[EmailService] Failed to load SMTP config from database:", error)
      return null
    }
  }

  private async resolveEmailConfig(): Promise<(EmailConfig & { fromName?: string }) | null> {
    const fromEnv = this.fromEnvironment()
    if (fromEnv) {
      return {
        ...fromEnv,
        fromName: "QCC Attendance System",
      }
    }

    return this.fromDatabase()
  }

  private async initializeTransporter() {
    try {
      const emailConfig = await this.resolveEmailConfig()
      this.transporter = null
      this.isConfigured = false
      this.lastError = null

      if (!emailConfig || !emailConfig.auth.user || !emailConfig.auth.pass) {
        console.warn("[EmailService] SMTP credentials not configured")
        this.lastError = "SMTP credentials are missing. Set SMTP_USER and SMTP_PASS or save SMTP settings in the admin panel."
        return
      }

      if (!Number.isFinite(emailConfig.port)) {
        console.warn("[EmailService] Invalid SMTP port configured")
        this.lastError = "SMTP port is invalid. Use port 587 (STARTTLS) or 465 (SSL/TLS)."
        return
      }

      this.transporter = nodemailer.createTransport(emailConfig)

      // Verify connection. If Gmail STARTTLS fails due network/greeting issues, try SSL fallback (465).
      try {
        await this.transporter.verify()
      } catch (primaryError: any) {
        const host = String(emailConfig.host || "").toLowerCase()
        const canTryGmailFallback = host.includes("smtp.gmail.com") && !emailConfig.secure

        if (!canTryGmailFallback) {
          throw primaryError
        }

        const fallbackConfig: EmailConfig = {
          host: "smtp.gmail.com",
          port: 465,
          secure: true,
          auth: {
            user: emailConfig.auth.user,
            pass: emailConfig.auth.pass,
          },
        }

        this.transporter = nodemailer.createTransport(fallbackConfig)
        await this.transporter.verify()
        console.warn("[EmailService] Primary SMTP profile failed; Gmail SSL fallback (465) is now active")
      }
      this.isConfigured = true
      this.senderEmail = emailConfig.auth.user
      this.senderName = emailConfig.fromName || "QCC Attendance System"
      this.lastError = null
      console.log("[EmailService] Email service initialized successfully")
    } catch (error: any) {
      console.error("[EmailService] Failed to initialize email service:", error)
      this.isConfigured = false
      this.transporter = null
      this.lastError = error?.message || "SMTP initialization failed"
    }
  }

  private async ensureInitialized() {
    if (!this.initializationPromise || !this.isConfigured || !this.transporter) {
      this.initializationPromise = this.initializeTransporter()
    }

    await this.initializationPromise
  }

  async refreshConfiguration() {
    this.initializationPromise = this.initializeTransporter()
    await this.initializationPromise
  }

  async isAvailable() {
    await this.ensureInitialized()
    return this.isConfigured && !!this.transporter
  }

  private async logDelivery(to: string, subject: string, status: "sent" | "failed", data: Record<string, any>, messageId?: string, errorMessage?: string) {
    try {
      const adminClient = await createAdminClient()
      await adminClient.from("email_delivery_logs").insert({
        recipient_user_id: data.recipientUserId || null,
        recipient_email: to,
        module: String(data.emailModule || "system"),
        event_key: String(data.emailEvent || "notification"),
        subject,
        status,
        provider_message_id: messageId || null,
        error_message: errorMessage || null,
        metadata: { ...(data.metadata || {}), ccRecipients: data.ccRecipients || [], replyTo: data.replyTo || null },
        sent_by: data.sentBy || null,
      })
    } catch (error) {
      console.warn("[EmailService] Failed to write delivery log:", error)
    }
  }

  async sendEmail(to: string, template: EmailTemplate, data: Record<string, any> = {}) {
    const subjectHint = String(template.subject || "").toLowerCase()
    const inferredModule = subjectHint.includes("loan") ? "loan" : subjectHint.includes("off-premises") || subjectHint.includes("off premises") ? "off_premises" : subjectHint.includes("transport") || subjectHint.includes("vehicle") ? "transport" : subjectHint.includes("leave") ? "leave" : "system"
    const module = String(data.emailModule || inferredModule).trim()
    const eventKey = String(data.emailEvent || (subjectHint.includes("approv") ? "approval" : "notification")).trim()
    data = {
      ...data,
      emailModule: module,
      emailEvent: eventKey,
      emailHeading: data.emailHeading || template.subject.replace(/^QCC Attendance\s*[-:|]\s*/i, "").trim(),
      emailSubtitle: data.emailSubtitle || "A clear update from the QCC Attendance System.",
    }
    try {
      const adminClient = await createAdminClient()
      const { data: settingsRow } = await adminClient.from("system_settings").select("settings").eq("id", 1).maybeSingle()
      const settings = settingsRow?.settings || {}
      const ccByModule = typeof settings.emailCcByModule === "string" ? JSON.parse(settings.emailCcByModule) : settings.emailCcByModule || {}
      const moduleKey = module.toLowerCase().replace(/-/g, "_")
      const configuredCopy = ccByModule[module] || ccByModule[moduleKey] || ccByModule[moduleKey.replace(/_/g, "-")] || []
      const configuredList = Array.isArray(configuredCopy) ? configuredCopy : String(configuredCopy).split(/[,;\n\s]+/)
      const moduleCopy = configuredList.map((value: unknown) => String(value).trim().toLowerCase()).filter((value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
      const primaryRecipient = to.trim().toLowerCase()
      const copyList = moduleCopy.filter((value: string) => value !== primaryRecipient)
      if (copyList.length) template = { ...template, cc: [...new Set([...(template.cc || []), ...copyList])] }
    } catch (error) {
      console.warn("[EmailService] Failed to load module CC settings:", error)
    }
    if (eventKey.toLowerCase().includes("approv") || subjectHint.includes("approv")) {
      const approvalCopy = String(process.env.APPROVAL_EMAIL_CC || "registry@qccgh.com").trim()
      if (approvalCopy && !(template.cc || []).includes(approvalCopy)) {
        template = { ...template, cc: [...(template.cc || []), approvalCopy] }
      }
    }
    if (module !== "system" && !data.useInlineTemplate) {
      try {
        const adminClient = await createAdminClient()
        const { data: savedTemplate } = await adminClient
          .from("email_templates")
          .select("subject, html_body, text_body, accent_color, is_active")
          .eq("module", module)
          .eq("event_key", eventKey)
          .maybeSingle()
        if (savedTemplate?.is_active) {
          template = {
            subject: savedTemplate.subject,
            html: wrapEmailWithWatermark(savedTemplate.html_body),
            text: savedTemplate.text_body,
            cc: template.cc,
            replyTo: template.replyTo,
          }
          data = {
            ...data,
            accentColor: savedTemplate.accent_color,
            emailHeading: savedTemplate.subject.replace(/^QCC Attendance\s*[-:|]\s*/i, "").trim(),
          }
        }
      } catch (error) {
        console.warn("[EmailService] Failed to load editable template; using workflow default", error)
      }
    }

    data = { ...data, ccRecipients: template.cc || [] }

    // Normalize the logo URL at send time so templates saved from Preview still
    // point at the deployed portal asset instead of a temporary preview origin.
    const normalizedHtml = template.html.replace(/<img[^>]+(?:logos|images)\/qcc-logo\.png[^>]*>/gi, "")

    // Replace template variables before selecting the delivery provider.
    const subject = this.replaceTemplateVariables(template.subject, data)
    const html = this.replaceTemplateVariables(normalizedHtml, data)
    const text = this.replaceTemplateVariables(template.text, data)

    // Resend is the primary transactional provider when connected. Calling its
    // HTTP API directly keeps the server dependency-free and works in serverless
    // deployments where SMTP connections are unreliable.
    const resendApiKey = String(process.env.RESEND_API_KEY || "").trim()
    const resendDomain = String(process.env.RESEND_EMAIL_DOMAIN || "").trim()
    const idempotencyBase = String(data.idempotencyKey || data.referenceId || data.requestId || data.id || "email")
    const messageFingerprint = createHash("sha256").update(JSON.stringify({ to, subject, html, text, cc: template.cc || [] })).digest("hex").slice(0, 24)
    const providerIdempotencyKey = `workflow-email/${encodeURIComponent(`${idempotencyBase}/${to}/${messageFingerprint}`)}`
    if (resendApiKey && resendDomain) {
      try {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
            "Idempotency-Key": providerIdempotencyKey,
          },
          body: JSON.stringify({
            from: `${this.senderName} <notifications@${resendDomain}>`,
            to: [to],
            reply_to: template.replyTo ? [template.replyTo] : this.senderEmail ? [this.senderEmail] : undefined,
            subject,
            html,
            text,
            ...(template.cc?.length ? { cc: template.cc } : {}),
          }),
        })
        const result = await response.json().catch(() => ({}))
        if (!response.ok) {
          const errorMessage = result?.message || response.statusText
          await this.logDelivery(to, subject, "failed", data, undefined, errorMessage)
          console.warn("[EmailService] Resend rejected email:", errorMessage)
          return { success: false, error: errorMessage }
        }
        await this.logDelivery(to, subject, "sent", data, result?.id)
        console.log("[EmailService] Resend email sent successfully:", result?.id)
        return { success: true, messageId: result?.id }
      } catch (error: any) {
        console.error("[EmailService] Resend request failed:", error)
        return { success: false, error: error?.message || "Resend request failed" }
      }
    }

    await this.ensureInitialized()

    if (!this.isConfigured || !this.transporter) {
      console.warn("[EmailService] Email service not configured, skipping email send")
      return { success: false, error: this.lastError || "Email service not configured" }
    }

    try {
      const mailOptions = {
        from: `"${this.senderName}" <${this.senderEmail}>`,
        to,
        replyTo: template.replyTo || this.senderEmail,
        subject,
        html,
        text,
        ...(template.cc?.length ? { cc: template.cc } : {}),
      }

      const result = await this.transporter.sendMail(mailOptions)
      console.log("[EmailService] Email sent successfully:", result.messageId)
      this.lastError = null
      return { success: true, messageId: result.messageId }
    } catch (error: any) {
      console.error("[EmailService] Failed to send email:", error)
      this.lastError = error?.message || "SMTP send failed"
      return { success: false, error: this.lastError }
    }
  }

  getLastError() {
    return this.lastError
  }

  private replaceTemplateVariables(template: string, data: Record<string, any>): string {
    const values = {
      ...data,
      firstName: data.firstName || data.first_name || data.staffName || data.staff_name || data.name,
      staffName: data.staffName || data.staff_name || data.fullName || data.full_name || data.name,
      requestTitle: data.requestTitle || data.request_title || data.title || data.subject,
      details: data.details || data.description || data.message || data.reason || data.comments,
    }

    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      const value = values[key]
      if (value === undefined || value === null || String(value).trim() === "") {
        return "Not provided"
      }
      return String(value)
    })
  }

  // Email templates
  static templates = {
    passwordReset: {
      subject: "QCC Attendance - Password Reset Request",
      html: wrapEmailWithWatermark(`
          <h2 style="color: #d97706;">Password Reset Request</h2>
          <p>Hello {{firstName}},</p>
          <p>You have requested to reset your password for your QCC Attendance account.</p>
          <p>Your temporary password is: <strong>{{tempPassword}}</strong></p>
          <p>Please log in and change your password immediately for security.</p>
          <p>If you did not request this password reset, please contact your administrator.</p>
          <hr style="margin: 20px 0;">
          <p style="color: #666; font-size: 12px;">This is an automated message from QCC Attendance System.</p>
      `),
      text: "Hello {{firstName}}, You have requested to reset your password. Your temporary password is: {{tempPassword}}. Please log in and change your password immediately.",
    },
    attendanceReminder: {
      subject: "QCC Attendance - Daily Check-in Reminder",
      html: wrapEmailWithWatermark(`
          <h2 style="color: #d97706;">Daily Check-in Reminder</h2>
          <p>Hello {{firstName}},</p>
          <p>This is a friendly reminder to check in for your shift today.</p>
          <p><strong>Scheduled Time:</strong> {{scheduledTime}}</p>
          <p><strong>Location:</strong> {{location}}</p>
          <p>Please ensure you check in on time to maintain accurate attendance records.</p>
          <hr style="margin: 20px 0;">
          <p style="color: #666; font-size: 12px;">This is an automated reminder from QCC Attendance System.</p>
      `),
      text: "Hello {{firstName}}, This is a reminder to check in for your shift today at {{scheduledTime}} at {{location}}.",
    },
    weeklyReport: {
      subject: "QCC Attendance - Weekly Report for {{weekOf}}",
      html: wrapEmailWithWatermark(`
          <h2 style="color: #d97706;">Weekly Attendance Report</h2>
          <p>Hello {{firstName}},</p>
          <p>Here's your attendance summary for the week of {{weekOf}}:</p>
          <ul>
            <li><strong>Total Hours:</strong> {{totalHours}}</li>
            <li><strong>Days Present:</strong> {{daysPresent}}</li>
            <li><strong>Days Absent:</strong> {{daysAbsent}}</li>
            <li><strong>Late Check-ins:</strong> {{lateCheckins}}</li>
          </ul>
          <p>Keep up the great work!</p>
          <hr style="margin: 20px 0;">
          <p style="color: #666; font-size: 12px;">This is an automated report from QCC Attendance System.</p>
      `),
      text: "Weekly Attendance Report for {{weekOf}}: Total Hours: {{totalHours}}, Days Present: {{daysPresent}}, Days Absent: {{daysAbsent}}, Late Check-ins: {{lateCheckins}}",
    },
  }
}

export const emailService = new EmailService()
export { EmailService }

export async function sendEmergencyCheckoutNotification(payload: {
  userName: string
  employeeId: string
  department: string
  checkInTime: string
  checkOutTime: string
  workHours: string | number
  emergencyReason: string
  location: string
}) {
  try {
    const recipientsEnv = process.env.EMERGENCY_NOTIFICATION_EMAILS || process.env.SMTP_USER || ""
    const recipients = recipientsEnv.split(",").map((s) => s.trim()).filter(Boolean)

    if (recipients.length === 0) {
      console.warn("[EmailService] No emergency notification recipients configured")
      return { success: false, error: "No recipients configured" }
    }

    const subject = `Emergency Check-out: ${payload.userName} (${payload.employeeId})`
    const html = wrapEmailWithWatermark(`
        <h2 style="color: #dc2626">Emergency Check-out Notification</h2>
        <p><strong>Employee:</strong> ${payload.userName} (${payload.employeeId})</p>
        <p><strong>Department:</strong> ${payload.department}</p>
        <p><strong>Location:</strong> ${payload.location}</p>
        <p><strong>Check-in Time:</strong> ${payload.checkInTime}</p>
        <p><strong>Check-out Time:</strong> ${payload.checkOutTime}</p>
        <p><strong>Work Hours:</strong> ${payload.workHours}</p>
        <p><strong>Reason:</strong> ${payload.emergencyReason}</p>
        <hr>
        <p style="color:#666; font-size:12px">QCC MANAGEMENT</p>
    `)

    const text = `Emergency Check-out by ${payload.userName} (${payload.employeeId})\nDepartment: ${payload.department}\nLocation: ${payload.location}\nCheck-in: ${payload.checkInTime}\nCheck-out: ${payload.checkOutTime}\nWork Hours: ${payload.workHours}\nReason: ${payload.emergencyReason}`

    return await emailService.sendEmail(recipients.join(","), { subject, html, text })
  } catch (error) {
    console.error("[EmailService] sendEmergencyCheckoutNotification error:", error)
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
}
