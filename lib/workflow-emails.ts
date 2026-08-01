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

const APP_URL = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://updates.qccapps.com").replace(/\/$/, "")

// ─── Brand palette ───────────────────────────────────────────────────────────
const GREEN       = "#1a6b30"
const DARK_GREEN  = "#0d3d1a"
const MID_GREEN   = "#1e7a3e"
const LOGO_URL    = `${APP_URL}/images/qcc-logo.png`

// ─── Base email shell ────────────────────────────────────────────────────────
function baseLayout(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>${title}</title></head>
<body style="margin:0;padding:0;background-color:#eef2ee;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<table cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#eef2ee;padding:32px 16px;">
  <tr><td align="center">
    <table cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;">

      <!-- ── HEADER ── -->
      <tr>
        <td style="background:linear-gradient(160deg,${DARK_GREEN} 0%,${GREEN} 55%,${MID_GREEN} 100%);border-radius:12px 12px 0 0;padding:0;">
          <table cellpadding="0" cellspacing="0" border="0" width="100%">
            <tr>
              <td style="padding:24px 32px 0 32px;">
                <img src="${LOGO_URL}" alt="QCC Logo" height="52" style="display:block;height:52px;width:auto;max-width:160px;" />
              </td>
              <td align="right" style="padding:24px 32px 0 0;vertical-align:middle;">
                <span style="display:inline-block;background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.25);border-radius:20px;padding:4px 12px;color:rgba(255,255,255,0.9);font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">HR &amp; Loans System</span>
              </td>
            </tr>
            <tr>
              <td colspan="2" style="padding:18px 32px 28px 32px;">
                <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;line-height:1.35;letter-spacing:-0.01em;">${title}</h1>
                <p style="margin:6px 0 0;color:rgba(255,255,255,0.62);font-size:12px;letter-spacing:0.02em;">Quality Control Company Ltd. (COCOBOD)</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- ── DIVIDER STRIP ── -->
      <tr>
        <td style="background:linear-gradient(90deg,${MID_GREEN},#2ecc71,${MID_GREEN});height:4px;font-size:0;line-height:0;">&nbsp;</td>
      </tr>

      <!-- ── BODY ── -->
      <tr>
        <td style="background:#ffffff;padding:32px 32px 24px 32px;">
          ${body}
        </td>
      </tr>

      <!-- ── FOOTER ── -->
      <tr>
        <td style="background:#0d3d1a;border-radius:0 0 12px 12px;padding:20px 32px;">
          <table cellpadding="0" cellspacing="0" border="0" width="100%">
            <tr>
              <td style="vertical-align:middle;">
                <img src="${LOGO_URL}" alt="QCC" height="28" style="display:inline-block;height:28px;width:auto;opacity:0.55;max-width:90px;" />
              </td>
              <td align="right" style="vertical-align:middle;">
                <p style="margin:0;color:rgba(255,255,255,0.5);font-size:10.5px;line-height:1.65;text-align:right;">
                  This is an automated message from the <strong style="color:rgba(255,255,255,0.75);">QCC HR &amp; Loans System</strong>.<br/>
                  Do not reply · Contact your HR department for assistance.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>

    </table>
  </td></tr>
</table>
</body>
</html>`
}

// ─── CTA button ──────────────────────────────────────────────────────────────
function btn(url: string, label: string): string {
  const fullUrl = url.startsWith("http") ? url : `${APP_URL}${url.startsWith("/") ? "" : "/"}${url}`
  return `<table cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;">
    <tr>
      <td style="background:linear-gradient(135deg,${DARK_GREEN} 0%,${GREEN} 100%);border-radius:8px;box-shadow:0 2px 8px rgba(13,61,26,0.35);">
        <a href="${fullUrl}" style="display:inline-block;padding:13px 32px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;letter-spacing:0.02em;white-space:nowrap;">${label} &rarr;</a>
      </td>
    </tr>
  </table>`
}

// ─── Status badge ─────────────────────────────────────────────────────────────
function statusBadge(label: string, type: "success" | "danger" | "warning" | "info"): string {
  const styles: Record<string, string> = {
    success: "background:#d1fae5;color:#065f46;border:1px solid #6ee7b7;",
    danger:  "background:#fee2e2;color:#991b1b;border:1px solid #fca5a5;",
    warning: "background:#fef3c7;color:#92400e;border:1px solid #fcd34d;",
    info:    "background:#dbeafe;color:#1e40af;border:1px solid #93c5fd;",
  }
  return `<span style="display:inline-block;padding:3px 12px;border-radius:20px;font-size:12px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;${styles[type]}">${label}</span>`
}

// ─── Detail table row ─────────────────────────────────────────────────────────
function row(label: string, value: string): string {
  return `<tr>
    <td style="padding:11px 16px;color:#6b7280;font-size:12px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;white-space:nowrap;width:38%;border-bottom:1px solid #f0f0f0;background:#f9fafb;">${label}</td>
    <td style="padding:11px 16px;color:#111827;font-size:14px;font-weight:600;border-bottom:1px solid #f0f0f0;background:#ffffff;">${value || "—"}</td>
  </tr>`
}

// ─── Detail table wrapper ─────────────────────────────────────────────────────
function table(rows: string): string {
  return `<table cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;border-radius:10px;overflow:hidden;border:1px solid #e5e7eb;margin-bottom:24px;">${rows}</table>`
}

// ─── Section heading ──────────────────────────────────────────────────────────
function sectionHeading(text: string): string {
  return `<p style="margin:0 0 10px;font-size:11px;font-weight:700;color:#6b7280;letter-spacing:0.1em;text-transform:uppercase;">${text}</p>`
}

export type WorkflowEmailPreviewTemplate =
  | "leave-submitted"
  | "leave-hr-approved"
  | "loan-hod-approved"
  | "loan-approved"

export function renderWorkflowEmailPreview(template: WorkflowEmailPreviewTemplate): string {
  const leaveLink = `${APP_URL}/dashboard/leave-planning`
  const loanLink = `${APP_URL}/dashboard/loans`

  switch (template) {
    case "leave-submitted":
      return baseLayout(
        "New Leave Planning Request",
        `<p style="margin:0 0 6px;font-size:14px;color:#374151;">A new leave request has been submitted and requires your review.</p>
        <p style="margin:0 0 22px;">${statusBadge("Pending HOD Review", "warning")}</p>
        ${sectionHeading("Request Details")}
        ${table(
          row("Staff Member", "Staff Member") +
          row("Leave Type", "Annual Leave") +
          row("Period", "2026-06-10 — 2026-06-24") +
          row("Days Requested", "10")
        )}
        ${btn(leaveLink, "Review Leave Request")}`,
      )

    case "leave-hr-approved":
      return baseLayout(
        "Leave Request Approved ✓",
        `<p style="margin:0 0 6px;font-size:14px;color:#374151;">Congratulations, <strong>Staff Member</strong>! Your leave request has been approved by HR.</p>
        <p style="margin:0 0 22px;">${statusBadge("Fully Approved", "success")}</p>
        ${sectionHeading("Your Approved Leave")}
        ${table(
          row("Leave Type", "Annual Leave") +
          row("Period", "2026-06-10 — 2026-06-24") +
          row("Approved Days", "10") +
          row("Approved by", "HR Approver")
        )}
        ${btn(leaveLink, "View My Leave Requests")}`,
      )

    case "loan-hod-approved":
      return baseLayout(
        "Loan Request Ready for Loan Office",
        `<p style="margin:0 0 6px;font-size:14px;color:#374151;">A loan request has been approved by the HOD and is now awaiting Loan Office processing.</p>
        <p style="margin:0 0 22px;">${statusBadge("HOD Approved — Awaiting Loan Office", "info")}</p>
        ${sectionHeading("Loan Request Details")}
        ${table(
          row("Staff Member", "Staff Member") +
          row("Loan Type", "Car Loan (Junior)") +
          row("Reference No.", "LN-20260506-3307") +
          row("Amount", "GH₵ 65,000") +
          row("HOD Approver", "HOD")
        )}
        ${btn(loanLink, "Process in Loan Office")}`,
      )

    case "loan-approved":
      return baseLayout(
        "Loan Request Approved ✓",
        `<p style="margin:0 0 6px;font-size:14px;color:#374151;">Congratulations, <strong>Staff Member</strong>! Your loan request has been approved.</p>
        <p style="margin:0 0 22px;">${statusBadge("Fully Approved", "success")}</p>
        ${sectionHeading("Your Approved Loan")}
        ${table(
          row("Loan Type", "Car Loan (Junior)") +
          row("Reference No.", "LN-20260506-3307") +
          row("Amount", "GH₵ 65,000") +
          row("Approved by", "Director")
        )}
        ${btn(loanLink, "View My Loan Requests")}`,
      )

    default:
      return baseLayout(
        "Workflow Email Preview",
        `<p style="margin:0;font-size:14px;color:#374151;">No preview template selected.</p>`,
      )
  }
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
      `<p style="margin:0 0 6px;font-size:14px;color:#374151;">A new leave request has been submitted and requires your review.</p>
      <p style="margin:0 0 22px;">${statusBadge("Pending HOD Review", "warning")}</p>
      ${sectionHeading("Request Details")}
      ${table(
        row("Staff Member", opts.staffName) +
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
      `<p style="margin:0 0 6px;font-size:14px;color:#374151;">A leave request has been approved by the HOD and is now awaiting HR Leave Office review.</p>
      <p style="margin:0 0 22px;">${statusBadge("HOD Approved — Awaiting HR Office", "info")}</p>
      ${sectionHeading("Request Details")}
      ${table(
        row("Staff Member", opts.staffName) +
        row("Leave Type", opts.leaveType) +
        row("Period", `${opts.startDate} — ${opts.endDate}`) +
        row("Days Requested", String(opts.requestedDays)) +
        row("HOD Approver", opts.hodName)
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
      `<p style="margin:0 0 6px;font-size:14px;color:#374151;">
        ${isRejected
          ? `Your leave request has been reviewed by your HOD.`
          : `Your HOD has reviewed your leave request and requested some changes.`}
      </p>
      <p style="margin:0 0 22px;">${isRejected ? statusBadge("Rejected by HOD", "danger") : statusBadge("Changes Requested", "warning")}</p>
      ${sectionHeading("Review Details")}
      ${table(
        row("Reviewed by (HOD)", opts.hodName) +
        row("Decision", isRejected ? "Rejected" : "Changes Requested") +
        row("Reason / Note", opts.reason)
      )}
      <p style="margin:20px 0 0;font-size:13px;color:#6b7280;">Please log in to review the details and resubmit if applicable.</p>
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
      `<p style="margin:0 0 6px;font-size:14px;color:#374151;">HR Leave Office has reviewed and forwarded this request for your final approval.</p>
      <p style="margin:0 0 22px;">${statusBadge("Awaiting Final HR Approval", "info")}</p>
      ${sectionHeading("Approved Leave Details")}
      ${table(
        row("Staff Member", opts.staffName) +
        row("Leave Type", opts.leaveType) +
        row("Approved Period", `${opts.adjustedStartDate} — ${opts.adjustedEndDate}`) +
        row("Approved Days", String(opts.adjustedDays)) +
        row("HR Leave Office", opts.reviewerName)
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
        "Leave Request Approved ✓",
        `<p style="margin:0 0 6px;font-size:14px;color:#374151;">Congratulations, <strong>${opts.staffName}</strong>! Your leave request has been approved by HR.</p>
        <p style="margin:0 0 22px;">${statusBadge("Fully Approved", "success")}</p>
        ${sectionHeading("Your Approved Leave")}
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
        `<p style="margin:0 0 6px;font-size:14px;color:#374151;">For your information — the following leave request has received final HR approval.</p>
        <p style="margin:0 0 22px;">${statusBadge("Fully Approved", "success")}</p>
        ${sectionHeading("Approved Leave Details")}
        ${table(
          row("Staff Member", opts.staffName) +
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
      `<p style="margin:0 0 6px;font-size:14px;color:#374151;">Your leave request has been reviewed and was not approved at this time.</p>
      <p style="margin:0 0 22px;">${statusBadge("Not Approved", "danger")}</p>
      ${sectionHeading("Decision Details")}
      ${table(
        row("Reviewed by (HR)", opts.approverName) +
        row("Reason / Note", opts.note || "No reason provided")
      )}
      <p style="margin:20px 0 0;font-size:13px;color:#6b7280;">If you have questions, please contact HR directly.</p>
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
 * 5-day resume reminder → notify the staff member AND their HOD/RM that the
 * staff member returns from leave in 5 days.
 */
export async function notifyLeaveResumeReminder(
  admin: AdminClient,
  opts: {
    leavePlanRequestId: string
    staffUserId: string
    staffName: string
    leaveType: string
    endDate: string
    resumeDate: string
    daysLeft: number
  },
): Promise<void> {
  try {
    const [staffEmail, hodEmails] = await Promise.all([
      emailForUser(admin, opts.staffUserId),
      hodEmailsFromReviews(admin, opts.leavePlanRequestId),
    ])

    const dashLink = `${APP_URL}/dashboard/leave-planning`

    // ── Email to the staff member ──
    if (staffEmail) {
      const subject = `Reminder: You Return from Leave in ${opts.daysLeft} Day${opts.daysLeft === 1 ? "" : "s"}`
      const html = baseLayout(
        `Return to Work — ${opts.daysLeft} Day${opts.daysLeft === 1 ? "" : "s"} Remaining`,
        `<p style="margin:0 0 6px;font-size:14px;color:#374151;">Dear <strong>${opts.staffName}</strong>,</p>
        <p style="margin:0 0 6px;font-size:14px;color:#374151;">Your approved leave ends in <strong>${opts.daysLeft} day${opts.daysLeft === 1 ? "" : "s"}</strong>. Please prepare to resume duties on <strong>${opts.resumeDate}</strong>.</p>
        <p style="margin:0 0 22px;">${statusBadge(`Resume Date: ${opts.resumeDate}`, "info")}</p>
        ${sectionHeading("Leave Summary")}
        ${table(
          row("Leave Type", opts.leaveType) +
          row("Leave End Date", opts.endDate) +
          row("Resume Date", opts.resumeDate) +
          row("Days Remaining", String(opts.daysLeft))
        )}
        <p style="margin:0;font-size:13px;color:#6b7280;">
          If you need to extend your leave, please contact HR as soon as possible.
        </p>`,
      )
      await send(admin, staffEmail, subject, html, "leave resume reminder staff")
    }

    // ── Email to HOD / RM ──
    if (hodEmails.length) {
      const subject = `Staff Return Notice: ${opts.staffName} resumes in ${opts.daysLeft} day${opts.daysLeft === 1 ? "" : "s"}`
      const html = baseLayout(
        "Staff Returning from Leave",
        `<p style="margin:0 0 6px;font-size:14px;color:#374151;">A staff member under your supervision will be returning from leave soon.</p>
        <p style="margin:0 0 22px;">${statusBadge(`Returning in ${opts.daysLeft} Day${opts.daysLeft === 1 ? "" : "s"}`, "info")}</p>
        ${sectionHeading("Return Details")}
        ${table(
          row("Staff Member", opts.staffName) +
          row("Leave Type", opts.leaveType) +
          row("Leave End Date", opts.endDate) +
          row("Expected Resume Date", opts.resumeDate)
        )}
        <p style="margin:0;font-size:13px;color:#6b7280;">
          Please ensure the staff member's workspace and duties are prepared for their return.
        </p>
        ${btn(dashLink, "View Leave Dashboard")}`,
      )
      await send(admin, hodEmails, subject, html, "leave resume reminder HOD")
    }
  } catch (e) {
    console.warn("[workflow-emails] notifyLeaveResumeReminder failed:", e)
  }
}

// ════════════════════════════════════════════════════════════════════════════
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
      `<p style="margin:0 0 6px;font-size:14px;color:#374151;">A staff member has submitted a new loan request that requires your approval.</p>
      <p style="margin:0 0 22px;">${statusBadge("Pending HOD Approval", "warning")}</p>
      ${sectionHeading("Loan Request Details")}
      ${table(
        row("Staff Member", opts.staffName) +
        row("Loan Type", opts.loanType) +
        row("Reference No.", opts.requestNumber) +
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
      `<p style="margin:0 0 6px;font-size:14px;color:#374151;">A loan request has been approved by the HOD and is now awaiting Loan Office processing.</p>
      <p style="margin:0 0 22px;">${statusBadge("HOD Approved — Awaiting Loan Office", "info")}</p>
      ${sectionHeading("Loan Request Details")}
      ${table(
        row("Staff Member", opts.staffName) +
        row("Loan Type", opts.loanType) +
        row("Reference No.", opts.requestNumber) +
        (opts.amount ? row("Amount", `GH₵ ${Number(opts.amount).toLocaleString()}`) : "") +
        row("HOD Approver", opts.hodName)
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
      `<p style="margin:0 0 6px;font-size:14px;color:#374151;">Your loan request has been reviewed by your HOD and was not approved.</p>
      <p style="margin:0 0 22px;">${statusBadge("Rejected by HOD", "danger")}</p>
      ${sectionHeading("Decision Details")}
      ${table(
        row("Loan Type", opts.loanType) +
        row("Reference No.", opts.requestNumber) +
        row("Reviewed by (HOD)", opts.hodName) +
        row("Reason / Note", opts.note || "No reason provided")
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
      `<p style="margin:0 0 6px;font-size:14px;color:#374151;">A loan request has advanced through the approval workflow and requires your action.</p>
      <p style="margin:0 0 22px;">${statusBadge(`${opts.fromStage} → ${opts.toStage}`, "info")}</p>
      ${sectionHeading("Loan Request Details")}
      ${table(
        row("Staff Member", opts.staffName) +
        row("Loan Type", opts.loanType) +
        row("Reference No.", opts.requestNumber) +
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
      "Loan Request Approved ✓",
      `<p style="margin:0 0 6px;font-size:14px;color:#374151;">Congratulations, <strong>${opts.staffName}</strong>! Your loan request has been approved.</p>
      <p style="margin:0 0 22px;">${statusBadge("Fully Approved", "success")}</p>
      ${sectionHeading("Your Approved Loan")}
      ${table(
        row("Loan Type", opts.loanType) +
        row("Reference No.", opts.requestNumber) +
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
      "Loan Request Not Approved",
      `<p style="margin:0 0 6px;font-size:14px;color:#374151;">Your loan request has been reviewed and was not approved at the ${opts.stage} stage.</p>
      <p style="margin:0 0 22px;">${statusBadge("Not Approved", "danger")}</p>
      ${sectionHeading("Decision Details")}
      ${table(
        row("Loan Type", opts.loanType) +
        row("Reference No.", opts.requestNumber) +
        row("Reviewed by", opts.rejectedBy) +
        row("Stage", opts.stage) +
        row("Reason / Note", opts.note || "No reason provided")
      )}
      ${btn(link, "View My Loan Requests")}`,
    )
    await send(admin, email, subject, html, "loan rejected notification")
  } catch (e) {
    console.warn("[workflow-emails] notifyLoanRejected failed:", e)
  }
}
