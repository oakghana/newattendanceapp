'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { AlertCircle, Banknote, AlertTriangle, TrendingDown, ArrowRight, Loader2 } from 'lucide-react'
import Link from 'next/link'

interface LoanItem {
  id: string
  label: string
  amount: number
  monthlyDeduction: number
  durationMonths: number | null
  expectedCompletion: string | null
  status: string
}

interface LeaveWarning {
  leaveEndDate: string
  daysOverdue: number
  severity: 'critical' | 'warning' | 'info'
  hodCheckedIn: boolean
}

interface SummaryData {
  loans: {
    count: number
    items: LoanItem[]
    totalAmount: number
    totalMonthlyDeduction: number
  }
  leaves: {
    warnings: LeaveWarning[]
  }
}

export function PersonalFinancialSummary() {
  const [data, setData] = useState<SummaryData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/dashboard/personal-summary')
      .then(r => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="flex items-center gap-2 p-4 text-sm text-slate-500">
      <Loader2 className="h-4 w-4 animate-spin" /> Loading your summary...
    </div>
  )

  if (!data) return null

  const hasLoans = data.loans.count > 0
  const hasWarnings = data.leaves.warnings.length > 0

  if (!hasLoans && !hasWarnings) return null

  return (
    <div className="space-y-3">

      {/* ── Leave Resumption Warnings ─────────────────────────────── */}
      {hasWarnings && data.leaves.warnings.map((w, i) => {
        const isCritical = w.severity === 'critical'
        const isWarning = w.severity === 'warning'
        return (
          <Link key={i} href="/dashboard/leave-management" className="block">
            <div className={`flex items-center gap-4 rounded-2xl border-2 px-5 py-4 transition-all hover:shadow-md ${
              isCritical ? 'border-red-400 bg-red-50' :
              isWarning  ? 'border-amber-400 bg-amber-50' :
                           'border-blue-300 bg-blue-50'
            }`}>
              {isCritical
                ? <AlertTriangle className="h-6 w-6 flex-shrink-0 text-red-600" />
                : <AlertCircle  className="h-6 w-6 flex-shrink-0 text-amber-600" />
              }
              <div className="flex-1 min-w-0">
                <p className={`font-bold text-sm ${isCritical ? 'text-red-900' : 'text-amber-900'}`}>
                  {isCritical ? 'Resumption Overdue' : 'Leave Resumption Pending'}
                </p>
                <p className="text-xs text-slate-600 mt-0.5">
                  Leave ended {new Date(w.leaveEndDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  {w.hodCheckedIn && ' · HOD check-in recorded'}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {w.daysOverdue > 0 && (
                  <Badge className={isCritical ? 'bg-red-200 text-red-900 font-bold' : 'bg-amber-200 text-amber-900 font-bold'}>
                    {w.daysOverdue} day{w.daysOverdue !== 1 ? 's' : ''} overdue
                  </Badge>
                )}
                <ArrowRight className="h-4 w-4 text-slate-400" />
              </div>
            </div>
          </Link>
        )
      })}

      {/* ── Active Loans ──────────────────────────────────────────── */}
      {hasLoans && (
        <Link href="/dashboard/loan-app" className="block">
          <div className="rounded-2xl border-2 border-indigo-200 bg-gradient-to-r from-indigo-50 to-white p-5 transition-all hover:shadow-md">
            {/* Header row */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600">
                  <Banknote className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="font-bold text-slate-900 text-sm">Active Loans</p>
                  <p className="text-xs text-slate-500">{data.loans.count} loan{data.loans.count !== 1 ? 's' : ''} in progress</p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-slate-400" />
            </div>

            {/* Metric chips */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              <div className="rounded-xl bg-white border border-slate-200 px-3 py-2 text-center">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Loans</p>
                <p className="text-xl font-bold text-indigo-700">{data.loans.count}</p>
              </div>
              <div className="rounded-xl bg-white border border-slate-200 px-3 py-2 text-center">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Total</p>
                <p className="text-xl font-bold text-slate-900">
                  ₵{data.loans.totalAmount >= 1000
                    ? `${(data.loans.totalAmount / 1000).toFixed(0)}k`
                    : data.loans.totalAmount.toLocaleString()}
                </p>
              </div>
              <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-center">
                <p className="text-xs font-semibold text-red-500 uppercase tracking-wide">Monthly</p>
                <p className="text-xl font-bold text-red-700">
                  ₵{Math.round(data.loans.totalMonthlyDeduction).toLocaleString()}
                </p>
              </div>
            </div>

            {/* Per-loan rows */}
            <div className="space-y-2">
              {data.loans.items.slice(0, 4).map(loan => (
                <div key={loan.id} className="flex items-center justify-between rounded-xl bg-white border border-slate-100 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">{loan.label}</p>
                    <p className="text-xs text-slate-500">
                      ₵{loan.amount.toLocaleString()}
                      {loan.durationMonths ? ` · ${loan.durationMonths} mo` : ''}
                      {loan.expectedCompletion
                        ? ` · completes ${new Date(loan.expectedCompletion).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}`
                        : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0 ml-3">
                    <TrendingDown className="h-3 w-3 text-red-500" />
                    <span className="text-sm font-bold text-red-700">
                      ₵{Math.round(loan.monthlyDeduction).toLocaleString()}<span className="text-xs font-normal">/mo</span>
                    </span>
                  </div>
                </div>
              ))}
              {data.loans.items.length > 4 && (
                <p className="text-center text-xs text-slate-500 pt-1">
                  +{data.loans.items.length - 4} more — view all in Loan Administration
                </p>
              )}
            </div>
          </div>
        </Link>
      )}
    </div>
  )
}
