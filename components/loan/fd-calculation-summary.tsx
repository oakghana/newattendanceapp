'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

interface FdCalculation {
  salary_per_annum?: number
  consolidated_salary_per_month?: number
  gross_salary_monthly?: number
  gross_deductions_monthly?: number
  net_salary_monthly?: number
  loan_installment_monthly?: number
  total_deductions_monthly?: number
  net_to_gross_ratio?: number
  recovery_period_months?: number
  other_allowances?: number
  half_gross_monthly?: number
  total_outstanding_loans?: number
  total_loan_exposure?: number
  outstanding_loans?: Record<string, number>
  [key: string]: any
}

interface FdCalculationSummaryProps {
  data: FdCalculation | string | null
  review?: string
}

export function FdCalculationSummary({ data, review }: FdCalculationSummaryProps) {
  const [expanded, setExpanded] = useState(false)

  if (!data) return null

  let calculation: FdCalculation = {}
  if (typeof data === 'string') {
    try {
      const match = data.match(/\{[\s\S]*\}/)
      if (match) {
        calculation = JSON.parse(match[0])
      }
    } catch (e) {
      return <p className="text-xs text-slate-600">{data}</p>
    }
  } else {
    calculation = data as FdCalculation
  }

  const netToGrossPercent = calculation.net_to_gross_ratio
    ? Math.round((calculation.net_to_gross_ratio || 0) * 100)
    : 0

  return (
    <div className="space-y-2">
      {/* Summary Row */}
      <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => setExpanded(!expanded)}>
        <div className="flex-1 space-y-1">
          <p className="text-sm font-semibold text-slate-900">
            ₵{(calculation.gross_salary_monthly || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })} gross
            {calculation.net_salary_monthly && (
              <span className="text-xs text-slate-600 ml-2">
                → ₵{(calculation.net_salary_monthly || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })} net
              </span>
            )}
          </p>
          <p className="text-xs text-slate-600">
            FD Ratio: <span className="font-semibold text-slate-900">{netToGrossPercent}%</span>
            {calculation.loan_installment_monthly && (
              <span className="ml-2">• Monthly Deduction: ₵{(calculation.loan_installment_monthly || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
            )}
          </p>
        </div>
        <ChevronDown
          className={`h-4 w-4 text-slate-600 transition-transform ${expanded ? 'rotate-180' : ''}`}
        />
      </div>

      {/* Detailed Breakdown (Expanded) */}
      {expanded && (
        <div className="p-4 rounded-lg bg-blue-50 border border-blue-200 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {calculation.gross_salary_monthly && (
              <div>
                <p className="text-xs text-slate-600 uppercase font-semibold">Gross Monthly</p>
                <p className="text-lg font-bold text-slate-900">
                  ₵{(calculation.gross_salary_monthly || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                </p>
              </div>
            )}
            {calculation.gross_deductions_monthly && (
              <div>
                <p className="text-xs text-slate-600 uppercase font-semibold">Deductions</p>
                <p className="text-lg font-bold text-red-600">
                  ₵{(calculation.gross_deductions_monthly || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                </p>
              </div>
            )}
            {calculation.net_salary_monthly && (
              <div>
                <p className="text-xs text-slate-600 uppercase font-semibold">Net Salary</p>
                <p className="text-lg font-bold text-green-600">
                  ₵{(calculation.net_salary_monthly || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                </p>
              </div>
            )}
            {calculation.loan_installment_monthly && (
              <div>
                <p className="text-xs text-slate-600 uppercase font-semibold">Loan Installment</p>
                <p className="text-lg font-bold text-slate-900">
                  ₵{(calculation.loan_installment_monthly || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}
                </p>
              </div>
            )}
          </div>

          {/* Outstanding Loans Breakdown */}
          {calculation.outstanding_loans && Object.keys(calculation.outstanding_loans).length > 0 && (
            <div>
              <p className="text-xs text-slate-600 uppercase font-semibold mb-2">Outstanding Loans</p>
              <div className="space-y-1 text-xs">
                {Object.entries(calculation.outstanding_loans).map(([loanType, amount]) => (
                  <div key={loanType} className="flex justify-between items-center py-1 px-2 rounded bg-white/70 border border-slate-200">
                    <span className="text-slate-700 capitalize">{loanType.replace(/_/g, ' ')}</span>
                    <span className="font-semibold text-slate-900">
                      ₵{Number(amount).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Summary Stats */}
          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-blue-200">
            {calculation.total_outstanding_loans && (
              <div>
                <p className="text-xs text-slate-600">Total Outstanding</p>
                <p className="font-bold text-slate-900">
                  ₵{(calculation.total_outstanding_loans || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                </p>
              </div>
            )}
            {calculation.recovery_period_months && (
              <div>
                <p className="text-xs text-slate-600">Recovery Period</p>
                <p className="font-bold text-slate-900">{calculation.recovery_period_months} months</p>
              </div>
            )}
          </div>

          {/* Review Note */}
          {review && (
            <div className="pt-2 border-t border-blue-200">
              <p className="text-xs text-slate-600 font-semibold mb-1">Accounts Executive Review</p>
              <p className="text-xs text-slate-700 italic">{review}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
