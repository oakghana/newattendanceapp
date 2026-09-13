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
    .in("status", ["md_approved", "approved_director", "referenced", "staff_receiving_funds", "partially_recovered", "fully_recovered"])
    .or("status.eq.md_approved,md_approved_at.not.is.null")
    .order("md_approved_at", { ascending: false })
    .limit(500)

  if (loansError) {
    console.error("[v0] Disbursement page - loan fetch error:", loansError)
  }

  // Collect all user_ids and staff_numbers to batch resolve profiles
  const rawLoans = loans || []
  const userIds = Array.from(new Set(rawLoans.map((l: any) => l.user_id).filter(Boolean))) as string[]
  const staffNumbers = Array.from(new Set(rawLoans.map((l: any) => l.staff_number).filter(Boolean))) as string[]

  const profileMapById = new Map<string, any>()
  const profileMapByEmpId = new Map<string, any>()

  if (userIds.length > 0) {
    const { data: profilesById } = await admin
      .from("user_profiles")
      .select("id, first_name, last_name, full_name, employee_id, position, email, departments(name, code)")
      .in("id", userIds)

    for (const p of profilesById || []) {
      profileMapById.set(p.id, p)
      if (p.employee_id) profileMapByEmpId.set(String(p.employee_id).trim(), p)
    }
  }

  if (staffNumbers.length > 0) {
    const missingEmpIds = staffNumbers.filter((num) => !profileMapByEmpId.has(String(num).trim()))
    if (missingEmpIds.length > 0) {
      const { data: profilesByEmp } = await admin
        .from("user_profiles")
        .select("id, first_name, last_name, full_name, employee_id, position, email, departments(name, code)")
        .in("employee_id", missingEmpIds)

      for (const p of profilesByEmp || []) {
        if (p.id) profileMapById.set(p.id, p)
        if (p.employee_id) profileMapByEmpId.set(String(p.employee_id).trim(), p)
      }
    }
  }

  const enrichedLoans: DisbursedLoan[] = rawLoans.map((loan: any) => {
    const prof = profileMapById.get(loan.user_id) || profileMapByEmpId.get(String(loan.staff_number || "").trim())
    
    // Resolve complete full name
    const profFullName = prof?.full_name?.trim() || `${prof?.first_name || ""} ${prof?.last_name || ""}`.trim()
    const rawLoanName = String(loan.staff_full_name || "").trim()
    const isValidLoanName = rawLoanName && !rawLoanName.toLowerCase().includes("unknown")
    const resolvedName = profFullName || (isValidLoanName ? rawLoanName : "") || (loan.staff_number ? `Staff #${loan.staff_number}` : "Staff Member")

    const resolvedEmpId = prof?.employee_id || loan.staff_number || ""
    const resolvedDept = (prof as any)?.departments?.name || (prof as any)?.department_name || loan.department_name || "General"
    const resolvedRank = prof?.position || loan.staff_rank || ""
    const resolvedEmail = prof?.email || loan.corporate_email || ""

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
      staff_receiving_funds_confirmed_at: loan.staff_receiving_funds_confirmed_at,
      staff_receiving_funds_confirmed_by: loan.staff_receiving_funds_confirmed_by,
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
