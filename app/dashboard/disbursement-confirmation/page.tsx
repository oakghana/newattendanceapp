"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { DisbursementConfirmationClient } from "@/components/disbursement-confirmation-client"
import { Loader2 } from "lucide-react"

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
  user_id: string | null
  user_profiles?: {
    departments?: {
      name: string
    } | null
  } | null
}

export default function DisbursementConfirmationPage() {
  const [disbursedLoans, setDisbursedLoans] = useState<DisbursedLoan[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchDisbursedLoans = async () => {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        
        if (!user) {
          setError("Not authenticated")
          return
        }

        // Get user's department to filter by
        const { data: profile } = await supabase
          .from("user_profiles")
          .select("department_id, departments(code, name)")
          .eq("id", user.id)
          .maybeSingle()

        // Check if user is in Accounts/Loan Office
        const deptName = (profile as any)?.departments?.name || ""
        const isAccountsOrLoanOffice = 
          deptName.toLowerCase().includes("account") ||
          deptName.toLowerCase().includes("finance") ||
          deptName.toLowerCase().includes("loan") ||
          deptName.toLowerCase().includes("welfare")

        if (!isAccountsOrLoanOffice) {
          setError("Only Accounts/Loan Office staff can access this page")
          setLoading(false)
          return
        }

        // Fetch loans in staff_receiving_funds status
        const { data: loans, error: loansError } = await supabase
          .from("loan_requests")
          .select(`
            id,
            request_number,
            staff_full_name,
            staff_number,
            loan_type_label,
            fixed_amount,
            status,
            md_approved_at,
            staff_receiving_funds_confirmed_at,
            staff_receiving_funds_confirmed_by,
            created_at,
            user_id,
            user_profiles!user_id (
              departments (name)
            )
          `)
          .eq("status", "staff_receiving_funds")
          .order("created_at", { ascending: false })
          .limit(500)

        if (loansError) throw loansError
        setDisbursedLoans(loans as DisbursedLoan[])
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load loans")
      } finally {
        setLoading(false)
      }
    }

    fetchDisbursedLoans()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    )
  }
  if (error) return <div className="p-6 text-red-600">{error}</div>

  return <DisbursementConfirmationClient loans={disbursedLoans} />
}
