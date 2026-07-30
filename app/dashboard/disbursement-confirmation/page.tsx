import { createClientAndGetUser, createAdminClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { DisbursementConfirmationClient } from "@/components/disbursement-confirmation-client"

interface DisbursedLoan {
  id: string
  request_number: string
  staff_full_name: string
  staff_number: string
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

  const userRole = (profile as any)?.role || ""
  const isAuthorized = 
    userRole === "hr_executive" ||
    userRole === "accounts_executive" ||
    userRole === "loan_office"

  if (!profile || !isAuthorized) {
    redirect("/auth/login")
  }

  // Fetch loans that have been approved by MD or Director HR (ready for disbursement confirmation)
  // Include both md_approved and awaiting_director_hr statuses as these are the ones ready to disburse
  const { data: loans, error: loansError } = await admin
    .from("loan_requests")
    .select("*")
    .in("status", ["md_approved", "awaiting_director_hr"])
    .order("md_approved_at", { ascending: false })
    .limit(500)

  if (loansError) {
    console.error("[v0] Disbursement page - loan fetch error:", loansError)
  }

  // For each loan, fetch the department name separately if needed
  const enrichedLoans: DisbursedLoan[] = []
  
  if (loans) {
    for (const loan of loans as any[]) {
      // Fetch department name for this user
      let department_name = ""
      if (loan.user_id) {
        const { data: userProf } = await admin
          .from("user_profiles")
          .select("departments(name)")
          .eq("id", loan.user_id)
          .maybeSingle()
        
        if (userProf) {
          department_name = (userProf as any).departments?.name || ""
        }
      }

      enrichedLoans.push({
        id: loan.id,
        request_number: loan.request_number,
        staff_full_name: loan.staff_full_name || "",
        staff_number: loan.staff_number || "",
        loan_type_label: loan.loan_type_label || "",
        fixed_amount: loan.fixed_amount || 0,
        status: loan.status || "",
        md_approved_at: loan.md_approved_at,
        staff_receiving_funds_confirmed_at: loan.staff_receiving_funds_confirmed_at,
        staff_receiving_funds_confirmed_by: loan.staff_receiving_funds_confirmed_by,
        created_at: loan.created_at,
        department_name,
      })
    }
  }

  return (
    <DisbursementConfirmationClient 
      loans={enrichedLoans} 
      userProfile={profile}
    />
  )
}
