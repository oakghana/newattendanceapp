import "server-only"
import nodemailer from "nodemailer"
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
}

class EmailService {
  private transporter: nodemailer.Transporter | null = null
  private isConfigured = false
  private initializationPromise: Promise<void> | null = null
  private senderEmail = ""
  private senderName = "QCC Attendance System"

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

      if (!emailConfig || !emailConfig.auth.user || !emailConfig.auth.pass) {
        console.warn("[EmailService] SMTP credentials not configured")
        return
      }

      if (!Number.isFinite(emailConfig.port)) {
        console.warn("[EmailService] Invalid SMTP port configured")
        return
      }

      this.transporter = nodemailer.createTransporter(emailConfig)

      // Verify connection
      await this.transporter.verify()
      this.isConfigured = true
      this.senderEmail = emailConfig.auth.user
      this.senderName = emailConfig.fromName || "QCC Attendance System"
      console.log("[EmailService] Email service initialized successfully")
    } catch (error) {
      console.error("[EmailService] Failed to initialize email service:", error)
      this.isConfigured = false
      this.transporter = null
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

  async sendEmail(to: string, template: EmailTemplate, data: Record<string, any> = {}) {
    await this.ensureInitialized()

    if (!this.isConfigured || !this.transporter) {
      console.warn("[EmailService] Email service not configured, skipping email send")
      return { success: false, error: "Email service not configured" }
    }

    try {
      // Replace template variables
      const subject = this.replaceTemplateVariables(template.subject, data)
      const html = this.replaceTemplateVariables(template.html, data)
      const text = this.replaceTemplateVariables(template.text, data)

      const mailOptions = {
        from: `"${this.senderName}" <${this.senderEmail}>`,
        to,
        subject,
        html,
        text,
      }

      const result = await this.transporter.sendMail(mailOptions)
      console.log("[EmailService] Email sent successfully:", result.messageId)
      return { success: true, messageId: result.messageId }
    } catch (error) {
      console.error("[EmailService] Failed to send email:", error)
      return { success: false, error: error.message }
    }
  }

  private replaceTemplateVariables(template: string, data: Record<string, any>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return data[key] || match
    })
  }

  // Email templates
  static templates = {
    passwordReset: {
      subject: "QCC Attendance - Password Reset Request",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #d97706;">Password Reset Request</h2>
          <p>Hello {{firstName}},</p>
          <p>You have requested to reset your password for your QCC Attendance account.</p>
          <p>Your temporary password is: <strong>{{tempPassword}}</strong></p>
          <p>Please log in and change your password immediately for security.</p>
          <p>If you did not request this password reset, please contact your administrator.</p>
          <hr style="margin: 20px 0;">
          <p style="color: #666; font-size: 12px;">This is an automated message from QCC Attendance System.</p>
        </div>
      `,
      text: "Hello {{firstName}}, You have requested to reset your password. Your temporary password is: {{tempPassword}}. Please log in and change your password immediately.",
    },
    attendanceReminder: {
      subject: "QCC Attendance - Daily Check-in Reminder",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #d97706;">Daily Check-in Reminder</h2>
          <p>Hello {{firstName}},</p>
          <p>This is a friendly reminder to check in for your shift today.</p>
          <p><strong>Scheduled Time:</strong> {{scheduledTime}}</p>
          <p><strong>Location:</strong> {{location}}</p>
          <p>Please ensure you check in on time to maintain accurate attendance records.</p>
          <hr style="margin: 20px 0;">
          <p style="color: #666; font-size: 12px;">This is an automated reminder from QCC Attendance System.</p>
        </div>
      `,
      text: "Hello {{firstName}}, This is a reminder to check in for your shift today at {{scheduledTime}} at {{location}}.",
    },
    weeklyReport: {
      subject: "QCC Attendance - Weekly Report for {{weekOf}}",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
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
        </div>
      `,
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
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #dc2626">Emergency Check-out Notification</h2>
        <p><strong>Employee:</strong> ${payload.userName} (${payload.employeeId})</p>
        <p><strong>Department:</strong> ${payload.department}</p>
        <p><strong>Location:</strong> ${payload.location}</p>
        <p><strong>Check-in Time:</strong> ${payload.checkInTime}</p>
        <p><strong>Check-out Time:</strong> ${payload.checkOutTime}</p>
        <p><strong>Work Hours:</strong> ${payload.workHours}</p>
        <p><strong>Reason:</strong> ${payload.emergencyReason}</p>
        <hr>
        <p style="color:#666; font-size:12px">This is an automated notification from QCC Attendance System.</p>
      </div>
    `

    const text = `Emergency Check-out by ${payload.userName} (${payload.employeeId})\nDepartment: ${payload.department}\nLocation: ${payload.location}\nCheck-in: ${payload.checkInTime}\nCheck-out: ${payload.checkOutTime}\nWork Hours: ${payload.workHours}\nReason: ${payload.emergencyReason}`

    return await emailService.sendEmail(recipients.join(","), { subject, html, text })
  } catch (error) {
    console.error("[EmailService] sendEmergencyCheckoutNotification error:", error)
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
}
