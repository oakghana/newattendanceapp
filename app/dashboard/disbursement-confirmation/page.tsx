import { createClientAndGetUser, createAdminClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { DisbursementConfirmationClient } from "@/components/disbursement-confirmation-client"
import { canAccessDisbursementConfirmation } from "@/lib/role-capabilities"

interface DisbursedLoan {
  id: string
  request_number: string
  staff_full_name: string
  staff_number: string
  staff_rank?: string
  corporate_email?: string
  loan_type_label: string
  fixed_amount: number
  status: string
  md_approved_at: string | null
  staff_receiving_funds_confirmed_at: string | null
  staff_receiving_funds_confirmed_by: string | null
  created_at: string
  department_name?: string
}

function formatProperCase(str: string): string {
  if (!str) return ""
  return str
    .split(/(\s+|-)/)
    .map((part) => {
      if (!part.trim() || part === "-") return part
      const upper = part.toUpperCase()
      if (["MR", "MRS", "MS", "DR", "PROF", "ING", "REV"].includes(upper)) {
        return upper === "DR" ? "Dr." : upper === "MR" ? "Mr." : upper === "MRS" ? "Mrs." : upper === "MS" ? "Ms." : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
      }
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
    })
    .join("")
}

function extractNameFromLetter(letter?: string | null): string | null {
  if (!letter) return null
  const match = letter.match(/(?:Your Ref No:[^\n]*\n+)?([A-Za-z\s.'-]+)\s*\(S\/No\.:/i)
  if (match && match[1]) {
    const raw = match[1].replace(/Your Ref No:[\s_]*/i, "").trim()
    if (raw.length > 2 && !/QUALITY CONTROL|HUMAN RESOURCES|MANAGING DIRECTOR/i.test(raw)) {
      return formatProperCase(raw)
    }
  }
  return null
}

function parseNameFromEmail(email?: string | null): string | null {
  if (!email || !email.includes("@")) return null
  const local = email.split("@")[0]
  if (/^(sectest|test|admin|user|leavestaff|driver)\d*$/i.test(local)) return null
  const parts = local.split(/[._-]/).filter(Boolean)
  if (parts.length >= 2) {
    return parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(" ")
  }
  return null
}

function resolveStaffFullName(loan: any, prof?: any): string {
  // 1. If loan already has a valid human full name
  const rawLoanName = String(loan?.staff_full_name || "").trim()
  if (rawLoanName && !/unknown|staff member|undefined|null/i.test(rawLoanName)) {
    return formatProperCase(rawLoanName)
  }

  // 2. Extract official recipient name from approved director memo letter
  const letterName = extractNameFromLetter(loan?.director_letter)
  if (letterName) return letterName

  // 3. From user profile
  if (prof) {
    const rawFull = String(prof.full_name || "").trim()
    if (rawFull && !/unknown|staff member|undefined|null/i.test(rawFull)) {
      return formatProperCase(rawFull)
    }

    const first = String(prof.first_name || "").trim()
    const last = String(prof.last_name || "").trim()
    if (first || last) {
      const combined = `${first} ${last}`.trim()
      if (!/^(leavestaff|test|user|staff)\s*(staff|user|member)?$/i.test(combined)) {
        return formatProperCase(combined)
      }
    }
  }

  // 4. From corporate or profile email
  const emailName = parseNameFromEmail(prof?.email || loan?.corporate_email)
  if (emailName) return emailName

  // 5. Fallback
  const staffNum = prof?.employee_id || loan?.staff_number
  return staffNum ? `Staff (${staffNum})` : "Staff Member"
}

export default async function DisbursementConfirmationPage() {
  const { user, authError } = await createClientAndGetUser()
  if (authError || !user) redirect("/auth/login")

  const admin = await createAdminClient()

  // Verify user is HR Executive, Accounts Executive, or Loan Office staff
  const { data: profile } = await admin
    .from("user_profiles")
    .select("id, role, first_name, last_name")
    .eq("id", user.id)
    .maybeSingle()

  if (!profile || !canAccessDisbursementConfirmation(profile.role)) {
    redirect("/dashboard/attendance")
  }

  const { data: loans, error: loansError } = await admin
    .from("loan_requests")
    .select("*")
    .in("status", ["md_approved", "approved_director", "referenced", "staff_receiving_funds", "partially_recovered", "fully_recovered", "payment_completed"])
    .or("status.eq.md_approved,md_approved_at.not.is.null")
    .order("md_approved_at", { ascending: false })
    .limit(500)

  if (loansError) {
    console.error("[v0] Disbursement page - loan fetch error:", loansError)
  }

  // Collect all user_ids and staff_numbers to batch resolve profiles
  const rawLoans = loans || []

  // Historical imports already represent money received. Normalize them into the
  // confirmed workflow and create schedules immediately so they never need a
  // manual confirmation or regeneration step.
  const legacyLoans = rawLoans.filter((loan: any) =>
    String(loan.hod_review_note || "").toLowerCase().startsWith("bulk imported by administrator") &&
    !loan.staff_receiving_funds_confirmed_at
  )
  if (legacyLoans.length > 0) {
    const nowIso = new Date().toISOString()
    await Promise.all(legacyLoans.map(async (loan: any) => {
      const confirmedAt = loan.disbursement_date || loan.recovery_start_date || loan.created_at || nowIso
      const durationMonths = Math.max(1, Math.trunc(Number(loan.recovery_months || loan.repayment_duration_months || 12)))
      await admin.from("loan_requests").update({
        status: "partially_recovered",
        repayment_status: "active",
        staff_receiving_funds_confirmed_at: confirmedAt,
        staff_receiving_funds_confirmed_by: "Historical import — automatically confirmed",
        repayment_duration_months: durationMonths,
        updated_at: nowIso,
      }).eq("id", loan.id)
      const scheduleResult = await admin.rpc("generate_repayment_schedule", {
        p_loan_request_id: loan.id,
        p_start_date: loan.recovery_start_date || loan.disbursement_date || nowIso.slice(0, 10),
        p_duration_months: durationMonths,
      })
      if (!scheduleResult.error) {
        await admin.from("loan_requests").update({ repayment_plan_generated_at: nowIso }).eq("id", loan.id)
      }
      loan.status = "partially_recovered"
      loan.repayment_status = "active"
      loan.staff_receiving_funds_confirmed_at = confirmedAt
      loan.staff_receiving_funds_confirmed_by = "Historical import — automatically confirmed"
      loan.repayment_duration_months = durationMonths
    }))
  }

  const userIds = Array.from(new Set(rawLoans.map((l: any) => l.user_id).filter(Boolean))) as string[]
  const staffNumbers = Array.from(new Set(rawLoans.map((l: any) => l.staff_number).filter(Boolean))) as string[]
  const loanIds = rawLoans.map((l: any) => l.id)

  const profileMapById = new Map<string, any>()
  const profileMapByEmpId = new Map<string, any>()
  const timelineMap = new Map<string, any>()

  const [profilesByIdRes, profilesByEmpRes, timelineRes] = await Promise.all([
    userIds.length > 0
      ? admin
          .from("user_profiles")
          .select("id, first_name, last_name, full_name, employee_id, position, email, departments(name, code)")
          .in("id", userIds)
      : Promise.resolve({ data: [] }),
    staffNumbers.length > 0
      ? admin
          .from("user_profiles")
          .select("id, first_name, last_name, full_name, employee_id, position, email, departments(name, code)")
          .in("employee_id", staffNumbers)
      : Promise.resolve({ data: [] }),
    loanIds.length > 0
      ? admin
          .from("loan_request_timeline")
          .select("loan_request_id, actor_id, actor_role, note, metadata, created_at")
          .in("loan_request_id", loanIds)
          .eq("action_key", "confirm_disbursement")
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
  ])

  for (const p of (profilesByIdRes.data as any[]) || []) {
    profileMapById.set(p.id, p)
    if (p.employee_id) profileMapByEmpId.set(String(p.employee_id).trim(), p)
  }

  for (const p of (profilesByEmpRes.data as any[]) || []) {
    if (p.id) profileMapById.set(p.id, p)
    if (p.employee_id) profileMapByEmpId.set(String(p.employee_id).trim(), p)
  }

  for (const te of (timelineRes.data as any[]) || []) {
    if (!timelineMap.has(te.loan_request_id)) {
      timelineMap.set(te.loan_request_id, te)
    }
  }

  const enrichedLoans: DisbursedLoan[] = rawLoans.map((loan: any) => {
    const prof = profileMapById.get(loan.user_id) || profileMapByEmpId.get(String(loan.staff_number || "").trim())
    
    // Resolve complete human full name
    const resolvedName = resolveStaffFullName(loan, prof)
    const resolvedEmpId = prof?.employee_id || loan.staff_number || ""
    const resolvedDept = (prof as any)?.departments?.name || (prof as any)?.department_name || loan.department_name || "General"
    const resolvedRank = prof?.position || loan.staff_rank || ""
    const resolvedEmail = prof?.email || loan.corporate_email || ""

    const timelineEntry = timelineMap.get(loan.id)
    const isConfirmed =
      loan.status === "partially_recovered" ||
      loan.status === "fully_recovered" ||
      loan.status === "payment_completed" ||
      Boolean(timelineEntry)

    const confirmedAt = timelineEntry?.created_at || (isConfirmed ? loan.updated_at : null)
    const confirmedBy =
      timelineEntry?.metadata?.confirmed_by_name ||
      timelineEntry?.note?.replace(/Disbursement confirmed received by staff\. Action taken by /i, "")?.replace(/\.$/, "") ||
      (isConfirmed ? "Accounts Department" : null)

    return {
      id: loan.id,
      request_number: loan.request_number || loan.id.slice(0, 8),
      staff_full_name: resolvedName,
      staff_number: resolvedEmpId,
      staff_rank: resolvedRank,
      corporate_email: resolvedEmail,
      loan_type_label: loan.loan_type_label || loan.loan_type_key || "Loan",
      fixed_amount: Number(loan.fixed_amount || loan.requested_amount || 0),
      status: loan.status || "",
      md_approved_at: loan.md_approved_at,
      staff_receiving_funds_confirmed_at: confirmedAt,
      staff_receiving_funds_confirmed_by: confirmedBy,
      created_at: loan.created_at,
      department_name: resolvedDept,
    }
  })

  return (
    <DisbursementConfirmationClient 
      loans={enrichedLoans} 
      userProfile={profile}
    />
  )
}
