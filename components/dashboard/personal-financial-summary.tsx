'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AlertCircle, Banknote, AlertTriangle, Clock, Loader2 } from 'lucide-react'
import Link from 'next/link'

interface LoanData {
  active: number
  totalAmount: number
  monthlyDeduction: number
  total: Array<{
    id: string
    loan_type_key: string
    requested_amount: number
    repayment_months: number
    monthly_installment: number
  }>
}

interface LeaveWarning {
  leaveType: string
  endDate: string
  daysOverdue: number
  severity: 'critical' | 'warning' | 'info'
}

interface SummaryData {
  loans: LoanData
  leaves: {
    active: number
    warnings: LeaveWarning[]
  }
}

export function PersonalFinancialSummary() {
  const [data, setData] = useState<SummaryData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch('/api/dashboard/personal-summary')
        if (!res.ok) throw new Error('Failed to fetch')
        setData(await res.json())
      } catch (e: any) {
        setError(e?.message || 'Failed to load summary')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    )
  }

  if (!data) return null

  const warningCount = data.leaves.warnings.filter(w => w.severity !== 'info').length

  return (
    <div className="space-y-4">
      {/* Leave Warnings */}
      {data.leaves.warnings.length > 0 && (
        <div className="space-y-3">
          {data.leaves.warnings.map((warning, idx) => (
            <Link key={idx} href="/dashboard/leave-management">
              <div className={`rounded-2xl border-2 p-4 cursor-pointer transition-all hover:shadow-md ${
                warning.severity === 'critical' 
                  ? 'border-red-300 bg-red-50'
                  : warning.severity === 'warning'
                  ? 'border-amber-300 bg-amber-50'
                  : 'border-blue-300 bg-blue-50'
              }`}>
                <div className="flex items-start gap-3">
                  {warning.severity === 'critical' ? (
                    <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <p className="font-semibold text-slate-900">
                      {warning.severity === 'critical' ? '⚠️ Resumption Overdue' : 'Resume Work Notice'}
                    </p>
                    <p className="text-xs text-slate-600 mt-1">
                      Your {warning.leaveType.replace(/_/g, ' ')} ended on {new Date(warning.endDate).toLocaleDateString()}
                      {warning.daysOverdue > 0 && (
                        <span className={warning.severity === 'critical' ? 'text-red-700 font-semibold' : 'text-amber-700'}>
                          {' '}• {warning.daysOverdue} day{warning.daysOverdue !== 1 ? 's' : ''} overdue
                        </span>
                      )}
                    </p>
                  </div>
                  <Badge className={warning.severity === 'critical' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}>
                    {warning.daysOverdue}d overdue
                  </Badge>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Loans Summary */}
      {data.loans.active > 0 && (
        <Link href="/dashboard/loan-app">
          <Card className="border-2 border-blue-200 bg-gradient-to-br from-blue-50 to-white cursor-pointer hover:shadow-lg transition-all">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Banknote className="h-5 w-5 text-blue-600" />
                Active Loans
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Quick Stats */}
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg bg-white p-3 border border-slate-200">
                  <p className="text-xs text-slate-600 font-semibold uppercase">Loans</p>
                  <p className="text-2xl font-bold text-slate-900">{data.loans.active}</p>
                </div>
                <div className="rounded-lg bg-white p-3 border border-slate-200">
                  <p className="text-xs text-slate-600 font-semibold uppercase">Total</p>
                  <p className="text-lg font-bold text-slate-900">
                    ₵{(data.loans.totalAmount / 1000).toFixed(1)}k
                  </p>
                </div>
                <div className="rounded-lg bg-red-50 p-3 border border-red-200">
                  <p className="text-xs text-red-600 font-semibold uppercase">Monthly</p>
                  <p className="text-lg font-bold text-red-700">
                    ₵{Math.round(data.loans.monthlyDeduction)}
                  </p>
                </div>
              </div>

              {/* Loan Details */}
              {data.loans.total.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-slate-200">
                  {data.loans.total.slice(0, 3).map((loan) => (
                    <div key={loan.id} className="flex items-center justify-between p-2 rounded bg-slate-50">
                      <div className="text-sm">
                        <p className="font-medium text-slate-900 capitalize">{loan.loan_type_key.replace(/_/g, ' ')}</p>
                        <p className="text-xs text-slate-500">₵{Number(loan.requested_amount).toLocaleString()} • {loan.repayment_months}mo</p>
                      </div>
                      <p className="text-xs font-semibold text-slate-700">₵{Math.round(loan.monthly_installment)}/mo</p>
                    </div>
                  ))}
                  {data.loans.total.length > 3 && (
                    <p className="text-xs text-slate-500 pt-1 italic">+{data.loans.total.length - 3} more loan{data.loans.total.length - 3 !== 1 ? 's' : ''}</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </Link>
      )}
    </div>
  )
}
