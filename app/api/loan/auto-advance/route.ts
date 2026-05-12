import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

export async function POST(req: Request) {
  try {
    // Initialize Supabase client at runtime
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { error: "Supabase credentials not configured" },
        { status: 500 }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseKey)
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
    let totalAdvanced = 0

    // Auto-advance loans: HOD → Loan Office
    const { data: hodPendingLoans, error: hodError } = await supabase
      .from("loan_hod_review")
      .select("*")
      .eq("decision", "pending")
      .lt("created_at", twoDaysAgo)

    if (hodError) throw hodError

    for (const review of hodPendingLoans || []) {
      const { error: updateError } = await supabase
        .from("loan_hod_review")
        .update({
          decision: "approved",
          reviewed_at: new Date().toISOString(),
          notes: "Auto-approved after 2 days",
        })
        .eq("id", review.id)

      if (updateError) {
        console.error(`[v0] Failed to auto-advance loan ${review.loan_id}:`, updateError)
      } else {
        totalAdvanced++
        console.log(`[v0] Auto-advanced loan ${review.loan_id} from HOD to Loan Office`)
      }
    }

    // Auto-advance loans: Loan Office → Accounts
    const { data: loanOfficePendingLoans, error: loanOfficeError } = await supabase
      .from("loan_office_review")
      .select("*")
      .eq("decision", "pending")
      .lt("created_at", twoDaysAgo)

    if (loanOfficeError) throw loanOfficeError

    for (const review of loanOfficePendingLoans || []) {
      const { error: updateError } = await supabase
        .from("loan_office_review")
        .update({
          decision: "approved",
          reviewed_at: new Date().toISOString(),
          notes: "Auto-approved after 2 days",
        })
        .eq("id", review.id)

      if (updateError) {
        console.error(`[v0] Failed to auto-advance loan ${review.loan_id}:`, updateError)
      } else {
        totalAdvanced++
        console.log(`[v0] Auto-advanced loan ${review.loan_id} from Loan Office to Accounts`)
      }
    }

    // Auto-advance loans: Accounts → Committee
    const { data: accountsPendingLoans, error: accountsError } = await supabase
      .from("loan_accounts_review")
      .select("*")
      .eq("decision", "pending")
      .lt("created_at", twoDaysAgo)

    if (accountsError) throw accountsError

    for (const review of accountsPendingLoans || []) {
      const { error: updateError } = await supabase
        .from("loan_accounts_review")
        .update({
          decision: "approved",
          reviewed_at: new Date().toISOString(),
          notes: "Auto-approved after 2 days",
        })
        .eq("id", review.id)

      if (updateError) {
        console.error(`[v0] Failed to auto-advance loan ${review.loan_id}:`, updateError)
      } else {
        totalAdvanced++
        console.log(`[v0] Auto-advanced loan ${review.loan_id} from Accounts to Committee`)
      }
    }

    return NextResponse.json({
      success: true,
      advancedCount: totalAdvanced,
      message: `Auto-advanced ${totalAdvanced} loan requests through their workflows`,
      details: {
        hodToLoanOffice: hodPendingLoans?.length || 0,
        loanOfficeToAccounts: loanOfficePendingLoans?.length || 0,
        accountsToCommittee: accountsPendingLoans?.length || 0,
      },
    })
  } catch (error: any) {
    console.error("[v0] Loan auto-advance error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
