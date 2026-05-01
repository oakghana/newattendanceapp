/**
 * Workflow Email Notifications
 *
 * Sends SMTP emails to the right people whenever a leave or loan request
 * moves to the next stage. All sends are best-effort (never throw) so they
 * cannot break the workflow itself.
 *
 * Required env vars:
 *   SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS
 *   APP_URL  (e.g. https://updates.qccapps.com) — used to build dashboard links
 */

import "server-only"
import { emailService } from "@/lib/email-service"

const APP_URL = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "")

// ─── colour palette shared by all templates ─────────────────────────────────
const GREEN = "#2c6216"
const LIGHT_GREEN = "#f0f7ec"

// QCC logo hosted on the live site – email clients that block remote images
// will just show the text fallback in the alt attribute.
const LOGO_URL = `${APP_URL}/images/qcc-logo.png`

function baseLayout(title: string, body: string): string {
  return `
<div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
  <div style="background:${GREEN};padding:16px 28px;display:flex;align-items:center;gap:14px;">
    <img src="${LOGO_URL}" alt="QCC Logo" width="48" height="48" style="border-radius:6px;background:#fff;padding:3px;flex-shrink:0;" />
    <div>
      <h2 style="margin:0;color:#fff;font-size:17px;line-height:1.3;">${title}</h2>
      <p style="margin:3px 0 0;color:#cde8ba;font-size:12px;">Quality Control Company Ltd. (COCOBOD) — HR System</p>
    </div>
  </div>
  <div style="padding:24px 28px;background:${LIGHT_GREEN};">
    ${body}
  </div>
  <div style="padding:12px 28px;background:#f8f8f8;border-top:1px solid #e2e8f0;">
    <p style="margin:0;color:#888;font-size:11px;">This is an automated notification from the QCC HR &amp; Loans System. Do not reply to this email.<br/>If you believe this email was sent in error, please contact your HR department.</p>
  </div>
</div>`
}

function btn(url: string, label: string): string {
  return `<a href="${url}" style="display:inline-block;margin-top:14px;padding:10px 22px;background:${GREEN};color:#fff;border-radius:5px;text-decoration:none;font-size:13px;font-weight:600;">${label}</a>`
}

function row(label: string, value: string): string {
  return `<tr><td style="padding:5px 0;color:#555;font-size:13px;width:160px;"><strong>${label}</strong></td><td style="padding:5px 0;color:#222;font-size:13px;">${value || "—"}</td></tr>`
}

function table(rows: string): string {
  return `<table style="border-collapse:collapse;margin-bottom:14px;">${rows}</table>`
}

// ─── Recipient helpers ──────────────────────────────────────────────────────

type AdminClient = any

async function emailsForRoles(admin: AdminClient, roles: string[]): Promise<string[]> {
  const { data } = await admin
    .from("user_profiles")
    .select("email")
    .in("role", roles)
    .eq("is_active", true)
  return (data || []).map((u: any) => String(u.email || "")).filter(Boolean)
}

async function emailForUser(admin: AdminClient, userId: string): Promise<string | null> {
  const { data } = await admin
    .from("user_profiles")
    .select("email")
    .eq("id", userId)
    .maybeSingle()
  return data?.email ? String(data.email) : null
}

async function hodEmailsForStaff(admin: AdminClient, staffUserId: string): Promise<string[]> {
  const { data: links } = await admin
    .from("loan_hod_linkages")
    .select("hod_user_id")
    .eq("staff_user_id", staffUserId)
    .limit(20)
  const hodIds = (links || []).map((l: any) => String(l.hod_user_id || "")).filter(Boolean)
  if (!hodIds.length) return []
  const { data } = await admin
    .from("user_profiles")
    .select("email")
    .in("id", hodIds)
    .eq("is_active", true)
  return (data || []).map((u: any) => String(u.email || "")).filter(Boolean)
}

async function hodEmailsFromReviews(admin: AdminClient, leavePlanRequestId: string): Promise<string[]> {
  const { data: reviews } = await admin
    .from("leave_plan_reviews")
    .select("reviewer_id")
    .eq("leave_plan_request_id", leavePlanRequestId)
  const reviewerIds = (reviews || []).map((r: any) => String(r.reviewer_id || "")).filter(Boolean)
  if (!reviewerIds.length) return []
  const { data } = await admin
    .from("user_profiles")
    .select("email")
    .in("id", reviewerIds)
    .eq("is_active", true)
  return (data || []).map((u: any) => String(u.email || "")).filter(Boolean)
}

// ─── DB template lookup ──────────────────────────────────────────────────────
// Looks up a custom template from workflow_message_templates. Returns the
// custom subject+body if found and active, otherwise returns null so the
// caller falls back to the hardcoded template.
async function lookupTemplate(
  admin: AdminClient,
  domain: "loan" | "leave",
  key: string,
): Promise<{ subject: string; body: string } | null> {
  try {
    const { data } = await admin
      .from("workflow_message_templates")
      .select("subject, body, is_active")
      .eq("workflow_domain", domain)
      .eq("template_key", key)
      .eq("is_active", true)
      .maybeSingle()
    if (data?.body) {
      return { subject: String(data.subject || ""), body: String(data.body) }
    }
    return null
  } catch {
    return null
  }
}

// ─── Bounce / send-failure admin notification ────────────────────────────────
async function notifyAdminOfBadEmail(
  admin: AdminClient,
  failedEmail: string,
  context: string,
): Promise<void> {
  try {
    const { data: admins } = await admin
      .from("user_profiles")
      .select("id")
      .eq("role", "admin")
      .eq("is_active", true)
    const adminIds = (admins || []).map((a: any) => String(a.id)).filter(Boolean)
    if (!adminIds.length) return
    await admin.from("staff_notifications").insert(
      adminIds.map((id: string) => ({
        recipient_id: id,
        title: "Email Delivery Failure",
        message: `An email notification could not be delivered to "${failedEmail}" during: ${context}. Please verify the staff member's email in Staff Management or disable their account if inactive.`,
        type: "email_delivery_failure",
        data: { failed_email: failedEmail, context },
        is_read: false,
      })),
    )
  } catch {
    // best-effort
  }
}

async function send(
  admin: AdminClient | null,
  to: string | string[],
  subject: string,
  html: string,
  context = "workflow notification",
): Promise<void> {
  const recipients = (Array.isArray(to) ? to : [to]).filter(Boolean)
  if (!recipients.length) return
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
  const results = await Promise.allSettled(
    recipients.map((email) =>
      emailService.sendEmail(email, { subject, html, text }, {}),
    ),
  )
  // Notify admin for any hard failures
  if (admin) {
    results.forEach((result, idx) => {
      if (result.status === "rejected") {
        notifyAdminOfBadEmail(admin, recipients[idx], context).catch(() => {})
      } else if (result.status === "fulfilled" && result.value && !(result.value as any).success) {
        const errMsg = String((result.value as any).error || "")
        // Only notify for hard bounce / invalid address errors, not temporary SMTP issues
        if (/invalid|not found|does not exist|no such user|address rejected|bounced/i.test(errMsg)) {
          notifyAdminOfBadEmail(admin, recipients[idx], context).catch(() => {})
        }
      }
    })
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  LEAVE WORKFLOW EMAILS
// ════════════════════════════════════════════════════════════════════════════

/**
 * Staff has submitted a new leave planning request → notify assigned HOD reviewers.
 */
export async function notifyLeaveSubmitted(
  admin: AdminClient,
  opts: {
    leavePlanRequestId: string
    staffName: string
    leaveType: string
    startDate: string
    endDate: string
    requestedDays: number
  },
): Promise<void> {
  try {
    const hodEmails = await hodEmailsFromReviews(admin, opts.leavePlanRequestId)
    if (!hodEmails.length) return

    const link = `${APP_URL}/dashboard/leave-planning`
    const subject = `[Action Required] New Leave Request from ${opts.staffName}`
    const html = baseLayout(
      "New Leave Planning Request",
      `<p style="margin:0 0 14px;font-size:14px;">A staff member has submitted a leave request that requires your review.</p>
      ${table(
        row("Staff", opts.staffName) +
        row("Leave Type", opts.leaveType) +
        row("Period", `${opts.startDate} — ${opts.endDate}`) +
        row("Days Requested", String(opts.requestedDays))
      )}
      ${btn(link, "Review Leave Request")}`,
    )
    await send(admin, hodEmails, subject, html, "leave submitted notification")
  } catch (e) {
    console.warn("[workflow-emails] notifyLeaveSubmitted failed:", e)
  }
}

/**
 * HOD has approved the leave request → notify HR Leave Office.
 */
export async function notifyLeaveHodApproved(
  admin: AdminClient,
  opts: {
    leavePlanRequestId: string
    staffName: string
    leaveType: string
    startDate: string
    endDate: string
    requestedDays: number
    hodName: string
  },
): Promise<void> {
  try {
    const hrOfficeRoles = ["hr_leave_office", "hr_officer", "hr_office", "manager_hr", "admin"]
    const hrEmails = await emailsForRoles(admin, hrOfficeRoles)
    if (!hrEmails.length) return

    const link = `${APP_URL}/dashboard/leave-planning`
    const subject = `[Action Required] Leave Request Approved by HOD — ${opts.staffName}`
    const html = baseLayout(
      "Leave Request Ready for HR Office Review",
      `<p style="margin:0 0 14px;font-size:14px;">A leave request has been approved by the HOD and is now awaiting HR Leave Office review and adjustment.</p>
      ${table(
        row("Staff", opts.staffName) +
        row("Leave Type", opts.leaveType) +
        row("Period", `${opts.startDate} — ${opts.endDate}`) +
        row("Days", String(opts.requestedDays)) +
        row("HOD", opts.hodName)
      )}
      ${btn(link, "Process in HR Leave Office")}`,
    )
    await send(admin, hrEmails, subject, html, "leave HOD approved notification")
  } catch (e) {
    console.warn("[workflow-emails] notifyLeaveHodApproved failed:", e)
  }
}

/**
 * HOD has rejected / requested changes → notify the staff member.
 */
export async function notifyLeaveHodDecision(
  admin: AdminClient,
  opts: {
    staffUserId: string
    staffName: string
    decision: "rejected" | "recommend_change"
    hodName: string
    reason: string
    leavePlanRequestId: string
  },
): Promise<void> {
  try {
    const email = await emailForUser(admin, opts.staffUserId)
    if (!email) return

    const isRejected = opts.decision === "rejected"
    const link = `${APP_URL}/dashboard/leave-planning`
    const subject = isRejected
      ? `Your Leave Request has been Rejected`
      : `Changes Requested on Your Leave Request`
    const html = baseLayout(
      isRejected ? "Leave Request Rejected" : "Leave Plan Changes Requested",
      `<p style="margin:0 0 14px;font-size:14px;">
        ${isRejected
          ? `Your leave request has been <strong>rejected</strong> by your HOD.`
          : `Your HOD has reviewed your leave request and requested some changes.`}
      </p>
      ${table(
        row("HOD", opts.hodName) +
        row("Decision", isRejected ? "Rejected" : "Changes Requested") +
        row("Reason", opts.reason)
      )}
      <p style="font-size:13px;color:#444;">Please log in to review the details and resubmit if applicable.</p>
      ${btn(link, "View My Leave Requests")}`,
    )
    await send(admin, email, subject, html, "leave HOD decision notification")
  } catch (e) {
    console.warn("[workflow-emails] notifyLeaveHodDecision failed:", e)
  }
}

/**
 * HR Leave Office has forwarded the request → notify HR Approvers.
 */
export async function notifyLeaveHrOfficeForwarded(
  admin: AdminClient,
  opts: {
    leavePlanRequestId: string
    staffName: string
    leaveType: string
    adjustedStartDate: string
    adjustedEndDate: string
    adjustedDays: number
    reviewerName: string
  },
): Promise<void> {
  try {
    const hrApproverRoles = [
      "hr_approver", "director_hr", "hr_director", "manager_hr",
      "hr_manager", "director_human_resources", "admin",
    ]
    const hrEmails = await emailsForRoles(admin, hrApproverRoles)
    if (!hrEmails.length) return

    const link = `${APP_URL}/dashboard/leave-planning`
    const subject = `[Action Required] Leave Request Ready for Final Approval — ${opts.staffName}`
    const html = baseLayout(
      "Leave Request Awaiting Final HR Approval",
      `<p style="margin:0 0 14px;font-size:14px;">HR Leave Office has reviewed and forwarded the following leave request for your final approval.</p>
      ${table(
        row("Staff", opts.staffName) +
        row("Leave Type", opts.leaveType) +
        row("Approved Period", `${opts.adjustedStartDate} — ${opts.adjustedEndDate}`) +
        row("Approved Days", String(opts.adjustedDays)) +
        row("HR Office", opts.reviewerName)
      )}
      ${btn(link, "Review & Approve")}`,
    )
    await send(admin, hrEmails, subject, html, "leave HR office forwarded notification")
  } catch (e) {
    console.warn("[workflow-emails] notifyLeaveHrOfficeForwarded failed:", e)
  }
}

/**
 * HR has given final approval → notify staff and HOD reviewers.
 */
export async function notifyLeaveHrApproved(
  admin: AdminClient,
  opts: {
    leavePlanRequestId: string
    staffUserId: string
    staffName: string
    leaveType: string
    effectiveStart: string
    effectiveEnd: string
    effectiveDays: number
    approverName: string
    memoToken?: string | null
  },
): Promise<void> {
  try {
    const [staffEmail, hodEmails] = await Promise.all([
      emailForUser(admin, opts.staffUserId),
      hodEmailsFromReviews(admin, opts.leavePlanRequestId),
    ])

    const memoLink = opts.memoToken
      ? `${APP_URL}/api/leave/planning/memo/${opts.leavePlanRequestId}?token=${opts.memoToken}`
      : null

    if (staffEmail) {
      const subject = `Your Leave Request has been Approved`
      const html = baseLayout(
        "Leave Request Approved",
        `<p style="margin:0 0 14px;font-size:14px;">Congratulations! Your leave request has been <strong style="color:${GREEN};">approved</strong> by HR.</p>
        ${table(
          row("Leave Type", opts.leaveType) +
          row("Period", `${opts.effectiveStart} — ${opts.effectiveEnd}`) +
          row("Approved Days", String(opts.effectiveDays)) +
          row("Approved by", opts.approverName)
        )}
        ${memoLink ? btn(memoLink, "Download Approval Memo (PDF)") : ""}`,
      )
      await send(admin, staffEmail, subject, html, "leave HR approved staff notification")
    }

    if (hodEmails.length) {
      const subject = `Leave Approved: ${opts.staffName}`
      const html = baseLayout(
        "Staff Leave Request Approved",
        `<p style="margin:0 0 14px;font-size:14px;">For your information — the following leave request has received final HR approval.</p>
        ${table(
          row("Staff", opts.staffName) +
          row("Leave Type", opts.leaveType) +
          row("Period", `${opts.effectiveStart} — ${opts.effectiveEnd}`) +
          row("Approved Days", String(opts.effectiveDays))
        )}`,
      )
      await send(admin, hodEmails, subject, html, "leave HR approved HOD notification")
    }
  } catch (e) {
    console.warn("[workflow-emails] notifyLeaveHrApproved failed:", e)
  }
}

/**
 * HR has rejected → notify staff.
 */
export async function notifyLeaveHrRejected(
  admin: AdminClient,
  opts: {
    staffUserId: string
    staffName: string
    approverName: string
    note: string
  },
): Promise<void> {
  try {
    const email = await emailForUser(admin, opts.staffUserId)
    if (!email) return

    const link = `${APP_URL}/dashboard/leave-planning`
    const subject = `Your Leave Request was Not Approved by HR`
    const html = baseLayout(
      "Leave Request Not Approved",
      `<p style="margin:0 0 14px;font-size:14px;">Your leave request has been <strong style="color:#dc2626;">rejected</strong> by HR.</p>
      ${table(
        row("HR Approver", opts.approverName) +
        row("Reason", opts.note || "No reason provided")
      )}
      <p style="font-size:13px;color:#444;">If you have questions, please contact HR directly.</p>
      ${btn(link, "View My Leave Requests")}`,
    )
    await send(admin, email, subject, html, "leave HR rejected notification")
  } catch (e) {
    console.warn("[workflow-emails] notifyLeaveHrRejected failed:", e)
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  LOAN WORKFLOW EMAILS
// ════════════════════════════════════════════════════════════════════════════

/**
 * Staff submitted a loan request → notify HOD(s).
 */
export async function notifyLoanSubmitted(
  admin: AdminClient,
  opts: {
    loanRequestId: string
    staffUserId: string
    staffName: string
    loanType: string
    requestNumber: string
    amount?: number | null
  },
): Promise<void> {
  try {
    const hodEmails = await hodEmailsForStaff(admin, opts.staffUserId)
    if (!hodEmails.length) return

    const link = `${APP_URL}/dashboard/loans`
    const subject = `[Action Required] New Loan Request from ${opts.staffName}`
    const html = baseLayout(
      "New Loan Request Awaiting HOD Review",
      `<p style="margin:0 0 14px;font-size:14px;">A staff member has submitted a loan request that requires your review.</p>
      ${table(
        row("Staff", opts.staffName) +
        row("Loan Type", opts.loanType) +
        row("Reference", opts.requestNumber) +
        (opts.amount ? row("Amount", `GH₵ ${Number(opts.amount).toLocaleString()}`) : "")
      )}
      ${btn(link, "Review Loan Request")}`,
    )
    await send(admin, hodEmails, subject, html, "loan submitted notification")
  } catch (e) {
    console.warn("[workflow-emails] notifyLoanSubmitted failed:", e)
  }
}

/**
 * HOD approved loan → notify Loan Office.
 */
export async function notifyLoanHodApproved(
  admin: AdminClient,
  opts: {
    loanRequestId: string
    staffName: string
    loanType: string
    requestNumber: string
    hodName: string
    amount?: number | null
  },
): Promise<void> {
  try {
    const loanOfficeRoles = ["loan_officer", "loan_office", "hr_officer", "hr_office", "manager_hr", "admin"]
    const emails = await emailsForRoles(admin, loanOfficeRoles)
    if (!emails.length) return

    const link = `${APP_URL}/dashboard/loans`
    const subject = `[Action Required] Loan Request Approved by HOD — ${opts.staffName}`
    const html = baseLayout(
      "Loan Request Ready for Loan Office",
      `<p style="margin:0 0 14px;font-size:14px;">A loan request has been approved by the HOD and is now waiting for Loan Office processing.</p>
      ${table(
        row("Staff", opts.staffName) +
        row("Loan Type", opts.loanType) +
        row("Reference", opts.requestNumber) +
        (opts.amount ? row("Amount", `GH₵ ${Number(opts.amount).toLocaleString()}`) : "") +
        row("HOD", opts.hodName)
      )}
      ${btn(link, "Process in Loan Office")}`,
    )
    await send(admin, emails, subject, html, "loan HOD approved notification")
  } catch (e) {
    console.warn("[workflow-emails] notifyLoanHodApproved failed:", e)
  }
}

/**
 * HOD rejected loan → notify staff.
 */
export async function notifyLoanHodRejected(
  admin: AdminClient,
  opts: {
    staffUserId: string
    staffName: string
    loanType: string
    requestNumber: string
    hodName: string
    note: string
  },
): Promise<void> {
  try {
    const email = await emailForUser(admin, opts.staffUserId)
    if (!email) return

    const link = `${APP_URL}/dashboard/loans`
    const subject = `Your Loan Request has been Rejected by HOD`
    const html = baseLayout(
      "Loan Request Rejected by HOD",
      `<p style="margin:0 0 14px;font-size:14px;">Your loan request has been <strong style="color:#dc2626;">rejected</strong> by your HOD.</p>
      ${table(
        row("Loan Type", opts.loanType) +
        row("Reference", opts.requestNumber) +
        row("HOD", opts.hodName) +
        row("Reason", opts.note || "No reason provided")
      )}
      ${btn(link, "View My Loan Requests")}`,
    )
    await send(admin, email, subject, html, "loan HOD rejected notification")
  } catch (e) {
    console.warn("[workflow-emails] notifyLoanHodRejected failed:", e)
  }
}

/**
 * Generic stage-advance email: someone in the chain has acted and the next role needs to be notified.
 * Used for Loan Office → Accounts, Accounts → Committee, etc.
 */
export async function notifyLoanStageAdvanced(
  admin: AdminClient,
  opts: {
    toRoles: string[]               // roles to notify
    staffName: string
    loanType: string
    requestNumber: string
    fromStage: string               // human label e.g. "Loan Office"
    toStage: string                 // human label e.g. "Accounts / FD"
    amount?: number | null
  },
): Promise<void> {
  try {
    const emails = await emailsForRoles(admin, opts.toRoles)
    if (!emails.length) return

    const link = `${APP_URL}/dashboard/loans`
    const subject = `[Action Required] Loan at ${opts.toStage} — ${opts.staffName}`
    const html = baseLayout(
      `Loan Request Advanced to ${opts.toStage}`,
      `<p style="margin:0 0 14px;font-size:14px;">A loan request has moved from <strong>${opts.fromStage}</strong> to <strong>${opts.toStage}</strong> and requires your attention.</p>
      ${table(
        row("Staff", opts.staffName) +
        row("Loan Type", opts.loanType) +
        row("Reference", opts.requestNumber) +
        (opts.amount ? row("Amount", `GH₵ ${Number(opts.amount).toLocaleString()}`) : "")
      )}
      ${btn(link, `Review in ${opts.toStage}`)}`,
    )
    await send(admin, emails, subject, html, "loan stage advanced notification")
  } catch (e) {
    console.warn("[workflow-emails] notifyLoanStageAdvanced failed:", e)
  }
}

/**
 * Director / HR has given final loan approval → notify staff.
 */
export async function notifyLoanApproved(
  admin: AdminClient,
  opts: {
    staffUserId: string
    staffName: string
    loanType: string
    requestNumber: string
    approverName: string
    amount?: number | null
    memoUrl?: string | null
  },
): Promise<void> {
  try {
    const email = await emailForUser(admin, opts.staffUserId)
    if (!email) return

    const subject = `Your Loan Request has been Approved`
    const html = baseLayout(
      "Loan Request Approved",
      `<p style="margin:0 0 14px;font-size:14px;">Congratulations! Your loan request has been <strong style="color:${GREEN};">approved</strong>.</p>
      ${table(
        row("Loan Type", opts.loanType) +
        row("Reference", opts.requestNumber) +
        (opts.amount ? row("Amount", `GH₵ ${Number(opts.amount).toLocaleString()}`) : "") +
        row("Approved by", opts.approverName)
      )}
      ${opts.memoUrl ? btn(opts.memoUrl, "Download Approval Memo (PDF)") : ""}`,
    )
    await send(admin, email, subject, html, "loan approved notification")
  } catch (e) {
    console.warn("[workflow-emails] notifyLoanApproved failed:", e)
  }
}

/**
 * Loan rejected at any stage → notify staff.
 */
export async function notifyLoanRejected(
  admin: AdminClient,
  opts: {
    staffUserId: string
    staffName: string
    loanType: string
    requestNumber: string
    rejectedBy: string
    stage: string
    note: string
  },
): Promise<void> {
  try {
    const email = await emailForUser(admin, opts.staffUserId)
    if (!email) return

    const link = `${APP_URL}/dashboard/loans`
    const subject = `Your Loan Request was Not Approved`
    const html = baseLayout(
      "Loan Request Rejected",
      `<p style="margin:0 0 14px;font-size:14px;">Your loan request has been <strong style="color:#dc2626;">rejected</strong> at the ${opts.stage} stage.</p>
      ${table(
        row("Loan Type", opts.loanType) +
        row("Reference", opts.requestNumber) +
        row("Rejected by", opts.rejectedBy) +
        row("Stage", opts.stage) +
        row("Reason", opts.note || "No reason provided")
      )}
      ${btn(link, "View My Loan Requests")}`,
    )
    await send(admin, email, subject, html, "loan rejected notification")
  } catch (e) {
    console.warn("[workflow-emails] notifyLoanRejected failed:", e)
  }
}
