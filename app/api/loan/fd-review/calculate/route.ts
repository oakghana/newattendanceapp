import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

interface CalculationInput {
  loan_amount_ghc: number
  recovery_period_months: number
  annual_salary_ghc: number
}

interface CalculationResult {
  monthly_repayment_amount: number
  total_recovery_value: number
  affordability_percentage: number
  affordability_status: 'affordable' | 'at_risk' | 'unaffordable'
  calculation_memo: string
  is_valid: boolean
  errors: string[]
}

/**
 * POST /api/loan/fd-review/calculate
 * Calculate FD values in real-time for the form
 * Input: loan_amount, recovery_period_months, annual_salary
 * Output: monthly_repayment, total_recovery_value, affordability check
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const {
      loan_amount_ghc,
      recovery_period_months,
      annual_salary_ghc,
    }: CalculationInput = body

    // Validation
    const errors: string[] = []

    if (!loan_amount_ghc || loan_amount_ghc <= 0) {
      errors.push('Loan amount must be greater than 0')
    }

    if (!recovery_period_months || recovery_period_months <= 0) {
      errors.push('Recovery period must be greater than 0 months')
    }

    if (!annual_salary_ghc || annual_salary_ghc <= 0) {
      errors.push('Annual salary must be greater than 0')
    }

    if (errors.length > 0) {
      return NextResponse.json({
        success: false,
        errors,
        is_valid: false,
      }, { status: 400 })
    }

    // Calculations
    const monthly_repayment_amount = parseFloat(
      (loan_amount_ghc / recovery_period_months).toFixed(2)
    )
    const total_recovery_value = parseFloat(loan_amount_ghc.toFixed(2))
    const monthly_salary = parseFloat((annual_salary_ghc / 12).toFixed(2))
    const affordability_percentage = parseFloat(
      ((monthly_repayment_amount / monthly_salary) * 100).toFixed(2)
    )

    // Affordability determination
    let affordability_status: 'affordable' | 'at_risk' | 'unaffordable'
    if (affordability_percentage <= 30) {
      affordability_status = 'affordable'
    } else if (affordability_percentage <= 50) {
      affordability_status = 'at_risk'
    } else {
      affordability_status = 'unaffordable'
    }

    // Generate calculation memo
    const calculation_memo = `FD CALCULATION SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Loan Amount: GHc ${loan_amount_ghc.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
Recovery Period: ${recovery_period_months} months
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CALCULATED VALUES:
Monthly Repayment: GHc ${monthly_repayment_amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
Total Recovery Value: GHc ${total_recovery_value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

AFFORDABILITY ANALYSIS:
Annual Salary: GHc ${annual_salary_ghc.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
Monthly Salary: GHc ${monthly_salary.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
Monthly Repayment as % of Salary: ${affordability_percentage.toFixed(2)}%
Status: ${affordability_status.toUpperCase()}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

GUIDELINES:
• Affordable (≤ 30%): Monthly repayment is sustainable
• At Risk (31-50%): Repayment capacity is constrained
• Unaffordable (> 50%): Staff may struggle with repayment
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`

    const result: CalculationResult = {
      monthly_repayment_amount,
      total_recovery_value,
      affordability_percentage,
      affordability_status,
      calculation_memo,
      is_valid: true,
      errors: [],
    }

    return NextResponse.json({
      success: true,
      data: result,
    })
  } catch (error) {
    console.error('[v0] FD calculation error:', error)
    return NextResponse.json({
      success: false,
      errors: ['Failed to calculate FD values'],
      is_valid: false,
    }, { status: 500 })
  }
}
