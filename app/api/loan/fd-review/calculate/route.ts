import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options),
              )
            } catch {
              // Handle readonly cookies
            }
          },
        },
      },
    )

    // Verify authentication
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      loan_amount,
      recovery_period_months,
      annual_salary,
      staff_id,
    } = body

    // Validation
    if (!loan_amount || !recovery_period_months || !annual_salary) {
      return NextResponse.json(
        { error: 'Missing required fields: loan_amount, recovery_period_months, annual_salary' },
        { status: 400 },
      )
    }

    const loanAmount = parseFloat(loan_amount)
    const recoveryMonths = parseInt(recovery_period_months)
    const annualSalary = parseFloat(annual_salary)

    if (loanAmount <= 0 || recoveryMonths <= 0 || annualSalary <= 0) {
      return NextResponse.json(
        { error: 'All amounts must be greater than 0' },
        { status: 400 },
      )
    }

    // Calculations
    const monthlyRepayment = loanAmount / recoveryMonths
    const monthlySalary = annualSalary / 12
    const repaymentPercentage = (monthlyRepayment / monthlySalary) * 100

    // Affordability check (30% threshold)
    const isAffordable = repaymentPercentage <= 30
    const affordabilityStatus = isAffordable ? 'APPROVED' : 'WARNING'

    // Generate calculation memo
    const calculationMemo = `FD CALCULATION SUMMARY
=====================
Loan Amount (GHc): ${loanAmount.toFixed(2)}
Recovery Period: ${recoveryMonths} months
Annual Salary (GHc): ${annualSalary.toFixed(2)}
Monthly Salary (GHc): ${monthlySalary.toFixed(2)}

CALCULATED VALUES:
Monthly Repayment (GHc): ${monthlyRepayment.toFixed(2)}
Total Recovery Value (GHc): ${loanAmount.toFixed(2)} (principal only)
Repayment as % of Monthly Salary: ${repaymentPercentage.toFixed(2)}%

AFFORDABILITY CHECK:
Status: ${affordabilityStatus}
${!isAffordable ? `⚠️ WARNING: Monthly repayment exceeds 30% of monthly salary. Suggest reducing amount or extending period.` : '✓ Monthly repayment is within acceptable limits (≤30% of salary)'}

Calculated at: ${new Date().toISOString()}
`

    return NextResponse.json({
      success: true,
      calculations: {
        loan_amount: loanAmount,
        recovery_period_months: recoveryMonths,
        annual_salary: annualSalary,
        monthly_salary: monthlySalary,
        monthly_repayment_amount: monthlyRepayment,
        total_recovery_value: loanAmount,
        repayment_percentage: repaymentPercentage,
        is_affordable: isAffordable,
        affordability_status: affordabilityStatus,
        calculation_memo: calculationMemo,
        calculated_at: new Date().toISOString(),
      },
    })
  } catch (error) {
    console.error('[v0] FD calculation error:', error)
    return NextResponse.json(
      { error: 'Failed to calculate FD values', details: (error as Error).message },
      { status: 500 },
    )
  }
}
